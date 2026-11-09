// The prompt a person copies and the commands that fetch Petal as one file. They live with the skill the
// server serves (@petal/agent/hosted), so the site's /connect and the server's /skill.md say the same.
export {
  agentPrompt,
  FILE_PATH,
  getFile,
  keepCommands,
  originFrom,
  terminalCommand,
} from '@petal/agent/hosted';
