import * as cdk from 'aws-cdk-lib';
import {pipelines} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as codestarconnections from 'aws-cdk-lib/aws-codestarconnections';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import {ApplicationStage} from "./application-stage";

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // // const ghToken = cdk.SecretValue.secretsManager('github-token')
    // const ghToken = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'GhToken', {
    //   parameterName: 'github-token',
    // });
    // // var ghToken = Secret.fromSecretCompleteArn(this, "GhToken", tokenForInstallingPackagesSecretArn);

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
