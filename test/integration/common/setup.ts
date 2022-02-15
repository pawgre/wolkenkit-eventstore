import { fork } from 'child_process';
const apps = [];

const cleanUpAndExit = function () {
  if (apps.length > 0) {
    apps.forEach(app => app.kill('SIGINT'));
  }
  process.exit(0);
};

const runApp = function ({ app, env = {}}) {
  return new Promise((resolve, reject) => {
    if (!app) {
      throw new Error('App is missing.');
    }

    const childProcess = fork(app, { env });

    apps.push(childProcess);

    childProcess.on('close', code => {
      const index = apps.indexOf(childProcess);

      apps.splice(index, 1);

      if (code !== 0) {
        return reject(new Error(`Exited with status code ${code}.`));
      }
      resolve(null);
    });
  });
};

process.on('SIGINT', cleanUpAndExit);
process.on('SIGTERM', cleanUpAndExit);

export const runAppConcurrently = async function ({ app, count, env }) {
  const apps = [];

  for (let i = 0; i < count; i++) {
    apps.push(runApp({ app, env }));
  }

  await Promise.all(apps);
};
