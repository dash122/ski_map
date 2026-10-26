import { generateTrees } from './tree-placement.js';
let config;
self.onmessage = ({ data }) => {
  if (data.config) { config = data.config; return; }
  self.postMessage({ key: data.key, result: generateTrees(config, data.ci, data.cj) });
};
