const { IncomingWebhook } = require("@slack/webhook");

const core = require("@actions/core");
const github = require("@actions/github");

const STATUS = core.getInput("status");

const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
const context = github.context;

const slackWebhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);

const { sha, ref } = context;
const shortHash = sha.substring(0, 7);

const { owner, repo } = context.repo;

async function main() {
  try {
    switch (STATUS) {
      case "success":
      case "failure":
      case "cancelled":
        await buildAndSendNotification(STATUS);
        break;
      default:
        throw new Error("You can specify success or failure or cancelled");
    }
  } catch (error) {
    console.log(error);
    core.setFailed(error.message);
  }
}

async function buildAndSendNotification(status) {
  const payload = await createPayload(status);
  await sendNotification(payload);
}

async function createPayload(status) {
  const response = await octokit.repos.getCommit({ owner, repo, ref: sha });
  const { commit, author } = response.data;
  const { message } = commit;
  const userName = getAuthorInfo(commit, author);
  const branchName = ref.replace("refs/heads/", "");

  const fullText = `${capitalizeFirstLetter(status)}: ${userName}'s workflow ${
    context.workflow
  } in <https://github.com/${owner}/${repo}|${owner}/${repo}>\n`;

  return {
    text: fullText,
    attachments: [
      {
        color: getColor(status),
        author_name: userName,
        author_link: `https://github.com/${userName}`,
        author_icon: `https://github.com/${userName}.png?size=32`,
        fields: [
          {
            title: "Branch",
            value: branchName,
            short: true,
          },
          {
            title: "Event",
            value: context.eventName,
            short: true,
          },
          {
            title: "Action URL",
            value: `https://github.com/${owner}/${repo}/commit/${sha}/checks`,
          },
          {
            title: "Commit details",
            value: `${message} (<https://github.com/${owner}/${repo}/commit/${sha}|${shortHash}>)`,
          },
        ],
      },
    ],
  };
}

function getColor(status) {
  return status == "success" ? "good" : status == "fail" ? "danger" : "warning";
}

function getAuthorInfo(commit, author) {
  return author ? author.login : commit.author.name;
}
async function sendNotification(payload) {
  core.debug(JSON.stringify(context, null, 2));
  await slackWebhook.send(payload);
  core.debug("Notification sent");
}

// I refuse to install a dependency for this
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

main();
