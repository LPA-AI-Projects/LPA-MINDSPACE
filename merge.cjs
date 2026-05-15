const fs = require('fs');
const oldBoard = fs.readFileSync('src/Board.jsx', 'utf-8');
const wrapper = fs.readFileSync('src/BoardWrapper.jsx', 'utf-8');

const jsxMatch = oldBoard.match(/return \([\s\S]*?(<>\s*<div[^]+)\);/);
if (jsxMatch) {
  let newBoard = wrapper.replace('<div id="wrapper-placeholder"></div>', jsxMatch[1]);
  fs.writeFileSync('src/Board.jsx', newBoard);
  console.log('Merged successfully');
} else {
  console.log('Failed to match JSX');
}
