import fs from "fs";
import { exec } from 'child_process';

const GEN_OUTPUT = "./";
const MODELS_PROTO_PATH = "./hamokMessage.proto";

async function createTypescriptModels() {
    await new Promise((resolve, reject) => {
        const command = [
            `PATH=$PATH:$(pwd)/node_modules/.bin`,
            `protoc`,
            // `./node_modules/.bin/protoc-gen-es`,
            `-I . `,
            `--es_out ${GEN_OUTPUT}`,
            `--es_opt target=ts`,
            MODELS_PROTO_PATH
        ].join(" ");
        exec(command, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve();
        });
    });
    return fs.readFileSync(
        `${GEN_OUTPUT}hamokMessage_pb.ts`
    )
}

async function writeToNpmLib(generatedCode) {
    fs.writeFileSync(`../src/messages/HamokMessage.ts`, generatedCode);
}

async function main() {
    const [typescriptCode] = await Promise.all([
        createTypescriptModels()
    ]);
    await Promise.all([
        writeToNpmLib(typescriptCode),
    ]);
}

main().then(() => {
    console.info("Done")
    process.exit(0);
}).catch(err => {
    console.error("Error occurred", err);
    process.exit(1);
}).finally(() => {
    
})