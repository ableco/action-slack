import * as core from '@actions/core';
import * as github from '@actions/github';
import { IncomingWebhook, IncomingWebhookSendArguments } from '@slack/webhook';

export interface With {
  status: string;
  mention: string;
  author_name: string;
  only_mention_fail: string;
  username: string;
  icon_emoji: string;
  icon_url: string;
  channel: string;
}

const groupMention = ['here', 'channel'];

export class Client {
  private webhook: IncomingWebhook;
  private github?: github.GitHub;
  private with: With;

  constructor(props: With, token?: string, webhookUrl?: string) {
    this.with = props;

    if (props.status !== 'custom') {
      if (token === undefined) {
        throw new Error('Specify secrets.GITHUB_TOKEN');
      }
      this.github = new github.GitHub(token);
    }

    if (webhookUrl === undefined) {
      throw new Error('Specify secrets.SLACK_WEBHOOK_URL');
    }
    this.webhook = new IncomingWebhook(webhookUrl);
  }

  async success(text: string) {
    if (this.github === undefined) {
      throw Error('Specify secrets.GITHUB_TOKEN');
    }
    const { sha } = github.context;
    const { owner, repo } = github.context.repo;
    const commit = await this.github.repos.getCommit({ owner, repo, ref: sha });
    const { author } = commit.data.commit;
    const commitMessage = `${
      commit.data.commit.message
    } (<https://github.com/${owner}/${repo}/commit/${sha}|${sha.substring(
      0,
      7,
    )}>)`;
    const template = await this.payloadTemplate(author.name, commitMessage);
    template.attachments[0].color = 'good';
    template.text += `Success: ${author.name}'s workflow (${github.context.workflow}) in <https://github.com/${owner}/${repo}|${owner}/${repo}>\n`;
    template.text += text;

    return template;
  }

  async fail(text: string) {
    if (this.github === undefined) {
      throw Error('Specify secrets.GITHUB_TOKEN');
    }
    const { sha } = github.context;
    const { owner, repo } = github.context.repo;
    const commit = await this.github.repos.getCommit({ owner, repo, ref: sha });
    const { author } = commit.data.commit;
    const commitMessage = `${
      commit.data.commit.message
    } (<https://github.com/${owner}/${repo}/commit/${sha}|${sha.substring(
      0,
      7,
    )}>)`;
    const template = await this.payloadTemplate(author.name, commitMessage);
    template.attachments[0].color = 'danger';
    template.text += this.mentionText(this.with.only_mention_fail);
    template.text += `Failed: ${author.name}'s workflow (${github.context.workflow}) in <https://github.com/${owner}/${repo}|${owner}/${repo}>\n`;
    template.text += text;

    return template;
  }

  async cancel(text: string) {
    if (this.github === undefined) {
      throw Error('Specify secrets.GITHUB_TOKEN');
    }
    const { sha } = github.context;
    const { owner, repo } = github.context.repo;
    const commit = await this.github.repos.getCommit({ owner, repo, ref: sha });
    const { author } = commit.data.commit;
    const commitMessage = `${
      commit.data.commit.message
    } (<https://github.com/${owner}/${repo}/commit/${sha}|${sha.substring(
      0,
      7,
    )}>)`;
    const template = await this.payloadTemplate(author.name, commitMessage);
    template.attachments[0].color = 'warning';
    template.text += `Cancel: ${author.name}'s workflow (${github.context.workflow}) in <https://github.com/${owner}/${repo}|${owner}/${repo}>\n`;
    template.text += text;

    return template;
  }

  async send(payload: string | IncomingWebhookSendArguments) {
    core.debug(JSON.stringify(github.context, null, 2));
    await this.webhook.send(payload);
    core.debug('send message');
  }

  private async payloadTemplate(authorName: string, commitMessage: string) {
    const text = this.mentionText(this.with.mention);
    const { username, icon_emoji, icon_url, channel } = this.with;

    return {
      text,
      username,
      icon_emoji,
      icon_url,
      channel,
      attachments: [
        {
          color: '',
          author_name: authorName,
          author_link: `https://github.com/${authorName}`,
          author_icon: `https://github.com/${authorName}.png?size=32`,
          fields: await this.fields(commitMessage),
        },
      ],
    };
  }

  private async fields(commitMessage: string) {
    return [
      this.ref,
      this.eventName,
      this.action,
      {
        title: 'Commit details',
        value: `${commitMessage}`,
      },
    ];
  }

  private get action() {
    const { sha } = github.context;
    const { owner, repo } = github.context.repo;

    return {
      title: 'Action URL',
      value: `https://github.com/${owner}/${repo}/commit/${sha}/checks`,
    };
  }

  private get eventName() {
    return {
      title: 'Event',
      value: github.context.eventName,
      short: true,
    };
  }

  private get ref() {
    return {
      title: 'Branch',
      value: github.context.ref.replace('refs/heads/', ''),
      short: true,
    };
  }

  private mentionText(mention: string) {
    const normalized = mention.replace(/ /g, '');
    if (groupMention.includes(normalized)) {
      return `<!${normalized}> `;
    } else if (normalized !== '') {
      const text = normalized
        .split(',')
        .map(userId => `<@${userId}>`)
        .join(' ');
      return `${text} `;
    }
    return '';
  }
}
