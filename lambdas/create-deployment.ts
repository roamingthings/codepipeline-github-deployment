import {
  CodePipelineClient,
  GetPipelineCommand,
  GetPipelineExecutionCommand,
  GetPipelineExecutionInput,
  GetPipelineInput
} from "@aws-sdk/client-codepipeline";

export const handler = async (event: any = {}): Promise<any> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const pipelineMessage = JSON.parse(event.Records[0].Sns.Message);
  const region = pipelineMessage.region;
  const pipelineName = pipelineMessage.detail.pipeline;
  const pipelineExecutionId = pipelineMessage.detail['execution-id'];
  const stage = pipelineMessage.detail.stage;
  const state = pipelineMessage.detail.state;

  console.log(JSON.stringify({
    region,
    pipelineName,
    pipelineExecutionId,
    stage,
    state,
  }));

  const client = new CodePipelineClient({region});
  const input: GetPipelineExecutionInput = {
    pipelineName,
    pipelineExecutionId,
  };
  const command = new GetPipelineExecutionCommand(input);
  const response = await client.send(command);

  const commitId = response.pipelineExecution?.artifactRevisions?.[0].revisionId;

  console.log(JSON.stringify({
    stage,
    state,
    commitId,
  }))

  const inputPipeline: GetPipelineInput = {
    name: pipelineName,
  }
  const pipelineCommand = new GetPipelineCommand(inputPipeline);
  const pipelineResponse = await client.send(pipelineCommand);

  const repositoryId = pipelineResponse.pipeline?.stages?.flatMap(stage =>
    stage.actions?.map(action => {
      return action.configuration?.FullRepositoryId;
    })
  ).find(value => value !== undefined && value !== null);

  console.log(JSON.stringify({
    repositoryId: repositoryId,
    ref: commitId,
    environment: stage,
  }));
};
