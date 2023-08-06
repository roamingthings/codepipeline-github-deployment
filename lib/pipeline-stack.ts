import * as cdk from 'aws-cdk-lib';
import {pipelines} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codestarconnections from 'aws-cdk-lib/aws-codestarconnections';
import * as codestarnotifications from 'aws-cdk-lib/aws-codestarnotifications';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import {ApplicationStage} from "./application-stage";
import * as sns from 'aws-cdk-lib/aws-sns';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { join } from 'path'

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = this.createPipeline();
    pipeline.addStage(new ApplicationStage(this, 'TestStage', {
      tags: {
        'stage': 'test',
        ...props?.tags
      },
    }));
    pipeline.addStage(new ApplicationStage(this, 'ProdStage', {
      tags: {
        'stage': 'prod',
        ...props?.tags
      },
    }));

    const publishGitHubDeploymentFunction = this.craetePublishGitHubDeploymentFunction();
    const notificationTopic = new sns.Topic(this, 'PipelineNotificationTopic');
    notificationTopic.addSubscription(new subs.LambdaSubscription(publishGitHubDeploymentFunction));
    this.createPipelineNotificationRule(pipeline.pipeline, notificationTopic);

  }

  private craetePublishGitHubDeploymentFunction() {
    const ghTokenParameter = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'GhToken', {
      parameterName: 'github-token',
    });
    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: [
          'aws-sdk',
        ],
      },
      depsLockFilePath: join(__dirname, 'lambdas', 'package-lock.json'),
      environment: {
        GITHUB_TOKEN_SSM_PARAMETER_NAME: ghTokenParameter.parameterArn,
      },
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.ARM_64,
    }
    const publishGitHubDeploymentFunction = new NodejsFunction(this, 'PublishGitHubDeploymentFunction', {
      entry: join(__dirname, 'lambdas', 'create-deployment.ts'),
      ...nodeJsFunctionProps,
    });
    ghTokenParameter.grantRead(publishGitHubDeploymentFunction);
    return publishGitHubDeploymentFunction;
  }

  private createPipelineNotificationRule(pipeline: codepipeline.Pipeline, notificationTopic: sns.ITopic) {
    new codestarnotifications.NotificationRule(this, 'PipelineNotificationRule', {
      source: pipeline,
      detailType: codestarnotifications.DetailType.FULL,
      events: [
        'codepipeline-pipeline-stage-execution-succeeded',
        'codepipeline-pipeline-stage-execution-canceled',
        'codepipeline-pipeline-stage-execution-failed',
      ],
      targets: [notificationTopic],
    });
  }

  private createPipeline(): pipelines.CodePipeline {
    const githubConnection = new codestarconnections.CfnConnection(this, 'GithubConnection', {
      connectionName: 'GithubConnection',
      providerType: "GitHub",
    });

    return new pipelines.CodePipeline(this, "Pipeline", {
      // pipelineName: props.getPipeline().getName(),
      selfMutation: true,
      crossAccountKeys: true,
      codeBuildDefaults: {
        buildEnvironment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.SMALL,
        },
      },
      synthCodeBuildDefaults: {
        buildEnvironment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.SMALL,
        },
      },
      synth: this.createSynthStep(githubConnection.attrConnectionArn),
    });
  }

  private createSynthStep(connectionArn: string): pipelines.CodeBuildStep {
    return new pipelines.CodeBuildStep('Synth', {
      input: pipelines.CodePipelineSource.connection(
        'roamingthings/codepipeline-github-deployment',
        'main',
        {
          connectionArn: connectionArn,
        }),
      installCommands: [
        'npm install -g aws-cdk',
      ],
      commands:
        [
          'npm ci',
          'npm run build',
          'npx cdk synth',
        ],
    });
  }
}
