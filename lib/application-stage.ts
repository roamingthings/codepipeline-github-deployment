import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {HelloApplicationStack} from "./hello-application-stack";

export class ApplicationStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    const service = new HelloApplicationStack(this, 'HelloApplicationStack');
  }
}
