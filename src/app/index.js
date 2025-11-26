export function init() {
    console.log('[App] init 已执行');   // ← 必须出现
    document.addEventListener('keydown', e => {
        if (e.altKey && e.key === 'F12') {
            console.log(11111);
            window.$api.invoke('open-devtools');
        }
    })
};