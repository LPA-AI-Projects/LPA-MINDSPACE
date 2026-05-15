const fs = require('fs');
let jsx = fs.readFileSync('src/Board.jsx', 'utf-8');
if (jsx.charCodeAt(0) === 0xFEFF) jsx = jsx.slice(1);

const component = `import { useEffect } from 'react';

export default function Board() {
  useEffect(() => {
    // Load vanilla JS engine only after the DOM is ready
    const script = document.createElement('script');
    script.src = '/board_vanilla.js';
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  return (
    <>
${jsx}
    </>
  );
}
`;

fs.writeFileSync('src/Board.jsx', component);
console.log('Wrapped Board.jsx');
