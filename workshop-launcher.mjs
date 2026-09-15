import {createWorkshopService} from './workshop-service.mjs?v=20260915-v1';

export function installWorkshopLauncher(api) {
    let dialog, service, previousFocus;
    function close({restoreFocus=true} = {}) {
        service?.close();
        service = null;
        window.aiedueWorkshopSession = null;
        dialog?.close();
        dialog?.remove();
        dialog = null;
        if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
    }
    function open() {
        const current = api.current();
        if (!current.id || current.role !== 'teacher') {
            api.notify('수업 공방은 교사 계정에서 사용할 수 있어요.');
            return;
        }
        close({restoreFocus:false});
        previousFocus = document.activeElement;
        api.closeModal();
        service = createWorkshopService(api, current.id);
        const session = service;
        window.aiedueWorkshopSession = Object.freeze({
            load: session.load, save: session.save, remove: session.remove,
            exit() { if (session !== service) return; close(); api.openLab(); },
            manageClass() { if (session !== service) return; close(); api.manageClass(); }
        });
        dialog = document.createElement('dialog');
        dialog.className = 'aiedue-workshop-dialog';
        dialog.setAttribute('aria-label', '에이두 수업 공방');
        const exit = document.createElement('button');
        exit.type = 'button'; exit.className = 'aiedue-workshop-close';
        exit.textContent = '×'; exit.setAttribute('aria-label', '수업 공방 닫기');
        exit.addEventListener('click', () => { close(); api.openLab(); });
        const frame = document.createElement('iframe');
        frame.title = '에이두 수업 공방';
        frame.src = new URL('./workshop/index.html?v=20260915-v1', import.meta.url).href;
        dialog.append(exit, frame);
        dialog.addEventListener('cancel', event => {event.preventDefault(); close(); api.openLab();});
        document.body.append(dialog);
        dialog.showModal();
        frame.focus();
    }
    return {open,close};
}
