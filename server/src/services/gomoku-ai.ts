import { Worker } from 'node:worker_threads';
import type { Difficulty } from '../../../shared/types.js';
import type { GomokuView, GomokuAction } from '../../../shared/games/gomoku/types.js';
// tsx dev and compiled production both resolve the same public-board-only module.
export function computeGomokuMove(
  view: GomokuView,
  playerId: string,
  difficulty: Difficulty,
): Promise<GomokuAction> {
  const suffix = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  const moduleURL = new URL(`../../../shared/games/gomoku/ai.${suffix}`, import.meta.url).href;
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `
      const { parentPort, workerData } = require('node:worker_threads');
      (async () => {
        const m = workerData.moduleURL.endsWith('.ts')
          ? await (await import('tsx/esm/api')).tsImport(workerData.moduleURL, { parentURL: workerData.moduleURL })
          : await import(workerData.moduleURL);
        parentPort.postMessage(m.aiMove(workerData.view, workerData.playerId, workerData.difficulty));
      })().catch(e => { throw e; });
    `,
      { eval: true, workerData: { moduleURL, view, playerId, difficulty } },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('五子棋 AI 搜索超时'));
    }, 10_000);
    worker.once('message', (action: GomokuAction) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(action);
    });
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('五子棋 AI 工作线程结束'));
    });
  });
}
