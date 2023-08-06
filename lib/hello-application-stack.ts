import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda'
import {Construct} from 'constructs';
import {CfnOutput} from "aws-cdk-lib";

export class HelloApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const fn = new lambda.Function(this, 'HelloFunction', {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      memorySize: 128,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`exports.handler = async (event) => {
          console.log('Received event:', JSON.stringify(event, null, 2));
          const response = {
              statusCode: 200,
              body: JSON.stringify('Hello from Lambda!'),
          };
          return response;
      };`),
    });
    const functionUrl = fn.addFunctionUrl();

    new CfnOutput(this, 'FunctionUrl', {
      value: functionUrl.url,
    });
  }
}
