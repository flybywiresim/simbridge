import './assets/css/App.css';
import React, { useEffect, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { McduScreen } from './components/McduScreen';
import { McduButtons } from './components/McduButtons';
import { WebsocketContext } from './WebsocketContext';
import darkBg from './assets/images/mcdu-a32nx-dark.png';
import bg from './assets/images/mcdu-a32nx.png';

// The url can contain parameter to turn on certain features.
// Parse the parameters and initialize the state accordingly.
let fullscreenParam = false;
let soundParam = false;
let aspect43Param = false;
const params = window.location.href.split('?');
if (params.length > 1) {
    params[1].split('&').forEach((p) => {
        switch (p) {
        case 'fullscreen':
            fullscreenParam = true;
            break;
        case 'sound':
            soundParam = true;
            break;
        case '43':
            aspect43Param = true;
            fullscreenParam = true;
            break;
        default:
            console.error('wrong param provided');
        }
    });
}

const App = () => {
    const [fullscreen, setFullscreen] = useState(fullscreenParam);
    const [soundEnabled] = useState(soundParam);
    const [dark, setDark] = useState(false);

    // as http and websocket port are always the same we can read it from the URL
    const socketUrl = `ws://${window.location.host}/interfaces/mcdu`;

    const [content, setContent] = useState(
        {
            lines: [
                ['', '', ''],
                ['', '', ''],
                ['', '', ''],
                ['', '', ''],
                ['', '', ''],
                ['', '', ''],
                ['', '', ''],
                ['', '', ''],
                ['', '', ''],
                ['', '', ''],
                ['', '', ''],
                ['', '', ''],
            ],
            scratchpad: '',
            title: '',
            titleLeft: '',
            page: '',
            arrows: [false, false, false, false],
        },
    );

    const {
        sendMessage,
        lastMessage,
        readyState,
    } = useWebSocket(socketUrl, {
        shouldReconnect: () => true,
        reconnectAttempts: Infinity,
        reconnectInterval: 500,
    });

    useEffect(() => {
        if (readyState === ReadyState.OPEN) {
            sendMessage('requestUpdate');
        }
    }, [readyState]);

    useEffect(() => {
        if (lastMessage != null) {
            const messageType = lastMessage.data.split(':')[0];
            if (messageType === 'update') {
                setContent(JSON.parse(lastMessage.data.substring(lastMessage.data.indexOf(':') + 1)).left);
            }
        }
    }, [lastMessage]);

    let backgroundImageUrl = bg;
    if (dark) {
        backgroundImageUrl = darkBg;
    }

    return (
        <>
            {!fullscreen && (
                <>
                    <div className="normal">
                        <div className="App" style={{ backgroundImage: `url(${backgroundImageUrl})` }}>
                            <WebsocketContext.Provider value={{ sendMessage, lastMessage, readyState }}>
                                <McduScreen content={content} />
                                <McduButtons soundEnabled={soundEnabled} />
                                <div
                                    className="button-grid"
                                    style={{
                                        left: `${184 / 10.61}%`,
                                        top: `${158 / 16.50}%`,
                                        width: `${706 / 10.61}%`,
                                        height: `${60 / 16.50}%`,
                                    }}
                                >
                                    <div className="button-row">
                                        <div
                                            className="button"
                                            title="Fullscreen"
                                            onClick={() => setFullscreen(!fullscreen)}
                                        />
                                    </div>
                                </div>
                                <div
                                    className="button-grid"
                                    style={{ left: '82%', top: '50%', width: '8%', height: '8%' }}
                                >
                                    <div className="button-row">
                                        <div className="button" title="Dark" onClick={() => setDark(!dark)} />
                                    </div>
                                </div>
                            </WebsocketContext.Provider>
                        </div>
                    </div>
                </>
            )}
            {fullscreen && (
                <>
                    <div className={aspect43Param ? 'fullscreen aspect43' : 'fullscreen'}>
                        <div className="App">
                            <WebsocketContext.Provider value={{ sendMessage, lastMessage, readyState }}>
                                <div title="Exit fullscreen" onClick={() => setFullscreen(false)}>
                                    <McduScreen content={content} aspect43={aspect43Param} />
                                </div>
                            </WebsocketContext.Provider>
                        </div>
                    </div>
                </>
            )}
        </>
    );
};

export default App;
