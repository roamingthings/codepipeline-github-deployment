import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {HelloApplicationStack} from "./hello-application-stack";

export interface ApplicationStageProps extends cdk.StageProps {
  tags: {[key: string]: string} | undefined
}

export class ApplicationStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: ApplicationStageProps) {
    super(scope, id, props);

    const service = new HelloApplicationStack(this, 'HelloApplicationStack', {
      tags: props?.tags,
    });
  }
}
