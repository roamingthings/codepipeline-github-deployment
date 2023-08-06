#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {Tags} from 'aws-cdk-lib';
import {PipelineStack} from "./lib/pipeline-stack";

const app = new cdk.App();
const pipelineStack = new PipelineStack(app, 'CodepipelineGithubDeploymentStack', {
});
Tags.of(pipelineStack).add('application', 'codepipeline-github-deployment')
