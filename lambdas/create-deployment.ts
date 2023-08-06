export const handler = async (event: any = {}): Promise<any> => {
  console.log('Received event:', JSON.stringify(event, null, 2));
};
