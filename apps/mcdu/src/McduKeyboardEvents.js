const McduFunctionalKeys = {
    Tab: 'DIR',
    Insert: 'PROG',
    Home: 'PERF',
    PageUp: 'INIT',
    Enter: 'DATA',
    NumpadEnter: 'DATA',
    Delete: 'FPLN',
    End: 'RAD',
    PageDown: 'FUEL',
    Escape: 'MENU',
    ShiftLeft: 'AIRPORT',
    ArrowLeft: 'PREVPAGE',
    ArrowRight: 'NEXTPAGE',
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    Backspace: 'CLR',
    Space: 'SP',
    Minus: 'PLUSMINUS',
    NumpadSubtract: 'PLUSMINUS',
    NumpadAdd: 'PLUSMINUS',
    Period: 'DOT',
    NumpadDecimal: 'DOT',
    NumpadDivide: 'DIV',
    Slash: 'DIV',
    NumpadMultiply: 'OVFY',
};

export class McduKeyboardEvents {
    constructor(socketSender) {
        this.socketSender = socketSender;
        this.mcduFunctionalKeys = McduFunctionalKeys;
    }

    getMcduKey = (keyEvent) => {
        // match mcdu L/R row input for F keys
        if (keyEvent.code.match(/F\d+/)) {
            const fn = parseInt(keyEvent.code.replace('F', ''));
            return fn <= 6 ? `L${fn}` : `R${fn - 6}`;
        }

        // match a-z
        if (keyEvent.code.match(/Key[A-Z]/)) {
            return keyEvent.code.replace('Key', '').toLocaleUpperCase();
        }

        // match 0-9
        if (keyEvent.code.match(/(Digit|Numpad)\d/i)) {
            return keyEvent.code.replace(/Digit|Numpad/i, '').toLocaleUpperCase();
        }

        // match mcdu function keys
        return this.mcduFunctionalKeys[keyEvent.code];
    }

    onKeyboardInput = (keyEvent) => {
        console.log('event', { key: keyEvent.key, code: keyEvent.code });
        const key = this.getMcduKey(keyEvent);

        if (key) {
            keyEvent.preventDefault();
            keyEvent.stopPropagation();
        } else {
            return;
        }

        console.log(`mcdu key: ${key}`);

        this.socketSender(`event:left:${key}`);
    }
}
