// bedrockModel.js
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler'); // 타임아웃 설정을 위해 필요

class BedrockModel {
    constructor(modelId, inferenceConfig, toolList = null) {
        this.modelId = modelId;
        this.inferenceConfig = inferenceConfig;
        this.toolList = toolList;

        // Read Timeout 방지를 위한 타임아웃 값 설정
        // Python의 read_timeout=5000ms와 유사하게 설정
        const requestHandler = new NodeHttpHandler({
            requestTimeout: 5000000, // 5000초 = 5000000ms (넉넉하게 설정, 필요에 따라 조정)
            socketTimeout: 5000000,
        });

        this.client = new BedrockRuntimeClient({
            region: 'us-east-1', // Bedrock 모델이 있는 리전
            requestHandler: requestHandler,
        });
    }

    async callModel(messages) {
        const input = {
            modelId: this.modelId,
            messages: messages,
            inferenceConfig: this.inferenceConfig,
        };

        if (this.toolList) {
            input.toolConfig = {
                tools: this.toolList
            };
        }

        const command = new ConverseCommand(input);

        try {
            const response = await this.client.send(command);
            return response;
        } catch (error) {
            console.error("Error calling Bedrock model:", error);
            throw error;
        }
    }
}

module.exports = BedrockModel;