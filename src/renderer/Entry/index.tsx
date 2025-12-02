import { render } from 'solid-js/web';
import App from '../App';

console.log('>>> index.tsx 被编译并执行了 <<<');
const root = document.getElementById('root');
console.log('root dom =', root);

if (root) render(() => <App />, root);
