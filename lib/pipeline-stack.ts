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
import {NodejsFunction, NodejsFunctionProps} from 'aws-cdk-lib/aws-lambda-nodejs';
import {join} from 'path'
import {Pipeline} from "aws-cdk-lib/aws-codepipeline";
import * as iam from "aws-cdk-lib/aws-iam";

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

    pipeline.buildPipeline();

    const publishGitHubDeploymentFunction = this.createPublishGitHubDeploymentFunction(pipeline.pipeline);
    const notificationTopic = new sns.Topic(this, 'PipelineNotificationTopic');
    notificationTopic.addSubscription(new subs.LambdaSubscription(publishGitHubDeploymentFunction));
    this.createPipelineNotificationRule(pipeline.pipeline, notificationTopic);

  }

  private createPublishGitHubDeploymentFunction(pipeline: Pipeline) {
    const ghTokenParameter = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'GhToken', {
      parameterName: 'github-token',
    });
    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: [
          'aws-sdk',
        ],
      },
      depsLockFilePath: join(__dirname, '../lambdas', 'package-lock.json'),
      environment: {
        GITHUB_TOKEN_SSM_PARAMETER_NAME: ghTokenParameter.parameterArn,
      },
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.ARM_64,
    }
    const publishGitHubDeploymentFunction = new NodejsFunction(this, 'PublishGitHubDeploymentFunction', {
      entry: join(__dirname, '../lambdas', 'create-deployment.ts'),
      ...nodeJsFunctionProps,
    });
    ghTokenParameter.grantRead(publishGitHubDeploymentFunction);
    publishGitHubDeploymentFunction.role?.addToPrincipalPolicy(iam.PolicyStatement.fromJson({
      "Effect": "Allow",
      "Action": [
        "codepipeline:GetPipelineExecution*",
        "codepipeline:GetPipeline*",
        ],
      "Resource": pipeline.pipelineArn,
    }));

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
      selfMutation: true,
      crossAccountKeys: true,
      synthCodeBuildDefaults: {
        buildEnvironment: {
          buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0,
          computeType: codebuild.ComputeType.SMALL,
          privileged: true,
        },
      },
      synth: this.createSynthStep(githubConnection.attrConnectionArn),
      codeBuildDefaults: {
        buildEnvironment: {
          buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0,
          computeType: codebuild.ComputeType.SMALL,
        },
      },
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
