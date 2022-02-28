import React, { useContext, useRef } from 'react';
import '../assets/css/McduButtons.css';
import { WebsocketContext } from '../WebsocketContext';
import soundFile from '../assets/audio/button-click.mp3';

const ButtonGrid = ({ children, x, y, width, height }) => (
    <div className="button-grid" style={{ left: `${x / 10.61}%`, top: `${y / 16.50}%`, width: `${width / 10.61}%`, height: `${height / 16.50}%` }}>
        {children}
    </div>
);

const ButtonRow = ({ children }) => (
    <div className="button-row">
        {children}
    </div>
);

const Button = ({ audioObject, soundEnabled, name }) => {
    const socket = useContext(WebsocketContext);
    const timeout = useRef();
    const buttonHeldTime = 1500;

    function pressButton(event) {
        if (event.defaultPrevented) {
            event.preventDefault();
        }
        if (soundEnabled) {
            audioObject.play();
        }
        socket.sendMessage(`event:${name}`);
        timeout.current = setTimeout(() => {
            socket.sendMessage(`event:${name}_Held`);
        }, buttonHeldTime);
    }

    function releaseButton(event) {
        event.preventDefault();
        if (timeout.current) {
            clearTimeout(timeout.current);
        }
    }

    if (name.length) {
        return (
            <div
                className="button"
                onMouseDown={(e) => pressButton(e)}
                onMouseUp={(e) => releaseButton(e)}
                onTouchStart={(e) => pressButton(e)}
                onTouchEnd={(e) => releaseButton(e)}
            />
        );
    }
    return <div className="dummy" />;
};

export const McduButtons = ({ soundEnabled }) => {
    const audioObject = new Audio(soundFile);
    return (
        <div className="buttons">
            <ButtonGrid x={0} y={216} width={1061} height={512}>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="L1" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="R1" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="L2" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="R2" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="L3" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="R3" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="L4" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="R4" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="L5" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="R5" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="L6" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="R6" />
                </ButtonRow>
            </ButtonGrid>
            <ButtonGrid x={115} y={804} width={745} height={180}>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="DIR" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="PROG" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="PERF" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="INIT" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="DATA" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="FPLN" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="RAD" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="FUEL" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="SEC" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="ATC" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="MENU" />
                </ButtonRow>
            </ButtonGrid>
            <ButtonGrid x={115} y={985} width={260} height={260}>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="AIRPORT" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="PREVPAGE" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="UP" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="NEXTPAGE" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="DOWN" />
                </ButtonRow>
            </ButtonGrid>
            <ButtonGrid x={435} y={1013} width={522} height={616}>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="A" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="B" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="C" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="D" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="E" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="F" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="G" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="H" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="I" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="J" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="K" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="L" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="M" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="N" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="O" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="P" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="Q" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="R" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="S" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="T" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="U" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="V" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="W" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="X" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="Y" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="Z" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="DIV" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="SP" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="OVFY" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="CLR" />
                </ButtonRow>
            </ButtonGrid>
            <ButtonGrid x={128} y={1250} width={300} height={375}>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="1" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="2" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="3" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="4" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="5" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="6" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="7" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="8" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="9" />
                </ButtonRow>
                <ButtonRow>
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="DOT" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="0" />
                    <Button audioObject={audioObject} soundEnabled={soundEnabled} name="PLUSMINUS" />
                </ButtonRow>
            </ButtonGrid>
        </div>
    );
};
