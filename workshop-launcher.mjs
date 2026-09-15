import {createWorkshopService} from './workshop-service.mjs?v=20260915-v3';

export function installWorkshopLauncher(api) {
    let dialog, service, previousFocus;
    let timetableService, timetableFrame, timetableResizeObserver;
    function closeTimetable() {
        timetableResizeObserver?.disconnect();
        timetableResizeObserver = null;
        timetableService?.close();
        timetableService = null;
        window.aiedueTimetableSession = null;
        timetableFrame?.remove();
        timetableFrame = null;
    }
    function openTimetable(container) {
        const current = api.current();
        if (!container || !current.id || current.role !== 'teacher') return;
        if (timetableFrame?.parentElement === container) return;
        closeTimetable();
        timetableService = createWorkshopService(api, current.id, 'schedule');
        const session = timetableService;
        window.aiedueTimetableSession = Object.freeze({
            load: session.load, save: session.save, remove: session.remove
        });
        timetableFrame = document.createElement('iframe');
        timetableFrame.className = 'class-timetable-frame';
        timetableFrame.title = '학급 시간표';
        timetableFrame.src = new URL('./workshop/index.html?view=timetable&v=20260915-v3', import.meta.url).href;
        const frame = timetableFrame;
        frame.addEventListener('load', () => {
            if (frame !== timetableFrame) return;
            const root = frame.contentDocument?.getElementById('root');
            if (!root) return;
            const resize = () => { frame.style.height = `${Math.ceil(root.getBoundingClientRect().height) + 2}px`; };
            timetableResizeObserver = new ResizeObserver(resize);
            timetableResizeObserver.observe(root);
            resize();
        }, {once:true});
        container.replaceChildren(timetableFrame);
    }
    function close({restoreFocus=true} = {}) {
        closeTimetable();
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
        service = createWorkshopService(api, current.id, 'worksheet');
        const session = service;
        window.aiedueWorkshopSession = Object.freeze({
            load: session.load, save: session.save, remove: session.remove,
            exit() { if (session !== service) return; close(); api.openLab(); }
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
        frame.src = new URL('./workshop/index.html?v=20260915-v3', import.meta.url).href;
        dialog.append(exit, frame);
        dialog.addEventListener('cancel', event => {event.preventDefault(); close(); api.openLab();});
        document.body.append(dialog);
        dialog.showModal();
        frame.focus();
    }
    return {open,close,openTimetable,closeTimetable};
}
