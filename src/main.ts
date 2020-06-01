import { getInput, setFailed, info } from "@actions/core";
import { context, GitHub } from "@actions/github";
import { create, UploadOptions } from "@actions/artifact";
import Fs from "fs";
import Path from "path";
// @ts-ignore
import table from "markdown-table";
import Term from "./Term";
import SizeLimit from "./SizeLimit";

const SIZE_LIMIT_URL = "https://github.com/ai/size-limit";

async function run() {
  try {
    if (context.payload.pull_request === null) {
      throw new Error(
        "No PR found. Only pull_request workflows are supported."
      );
    }

    // const token = getInput("github_token");
    const skipStep = getInput("skip_step");
    const buildScript = getInput("build_script");
    // const octokit = new GitHub(token);
    const name = getInput("artifact-name", { required: false });
    const term = new Term();
    const limit = new SizeLimit();

    const { status, output } = await term.execSizeLimit(
      null,
      skipStep,
      buildScript
    );
    const { output: baseOutput } = await term.execSizeLimit(
      process.env.GITHUB_BASE_REF,
      null,
      buildScript
    );

    let base;
    let current;

    try {
      base = limit.parseResults(baseOutput);
      current = limit.parseResults(output);
    } catch (error) {
      console.log(
        "Error parsing size-limit output. The output should be a json."
      );
      throw error;
    }

    // const number = context.payload.pull_request.number;
    // const event = status > 0 ? "REQUEST_CHANGES" : "COMMENT";
    const body = [
      `## [size-limit](${SIZE_LIMIT_URL}) report`,
      table(limit.formatResults(base, current))
    ].join("\r\n");

    try {
      const artifactClient = create();
      const options: UploadOptions = {
        continueOnError: false
      };
      const path = Path.join(__dirname, "size-limit.md");
      Fs.writeFileSync(path, body, "utf8");

      const uploadResponse = await artifactClient.uploadArtifact(
        name || "artifact",
        [path],
        __dirname,
        options
      );

      if (uploadResponse.failedItems.length > 0) {
        setFailed(
          `An error was encountered when uploading ${uploadResponse.artifactName}.`
        );
      } else if (status > 0) {
        setFailed(`Failed.`);
      } else {
        info(
          `Artifact ${uploadResponse.artifactName} has been successfully uploaded!`
        );
      }
    } catch (error) {
      console.log("Error creating PR review.");
    }
  } catch (error) {
    setFailed(error.message);
  }
}

run();
