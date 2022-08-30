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

const Button = ({ soundEnabled, name }) => {
    const socket = useContext(WebsocketContext);
    const timeout = useRef();
    const buttonHeldTime = 1500;

    function pressButton(event) {
        if (event.defaultPrevented) {
            event.preventDefault();
        }
        if (soundEnabled) {
            new Audio(soundFile).play();
        }
        socket.sendMessage(`event:left:${name}`);
        timeout.current = setTimeout(() => {
            socket.sendMessage(`event:left:${name}_Held`);
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

export const McduButtons = ({ soundEnabled }) => (
    <div className="buttons">
        <ButtonGrid x={0} y={216} width={1061} height={512}>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="L1" />
                <Button soundEnabled={soundEnabled} name="R1" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="L2" />
                <Button soundEnabled={soundEnabled} name="R2" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="L3" />
                <Button soundEnabled={soundEnabled} name="R3" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="L4" />
                <Button soundEnabled={soundEnabled} name="R4" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="L5" />
                <Button soundEnabled={soundEnabled} name="R5" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="L6" />
                <Button soundEnabled={soundEnabled} name="R6" />
            </ButtonRow>
        </ButtonGrid>
        <ButtonGrid x={115} y={804} width={745} height={180}>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="DIR" />
                <Button soundEnabled={soundEnabled} name="PROG" />
                <Button soundEnabled={soundEnabled} name="PERF" />
                <Button soundEnabled={soundEnabled} name="INIT" />
                <Button soundEnabled={soundEnabled} name="DATA" />
                <Button soundEnabled={soundEnabled} name="" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="FPLN" />
                <Button soundEnabled={soundEnabled} name="RAD" />
                <Button soundEnabled={soundEnabled} name="FUEL" />
                <Button soundEnabled={soundEnabled} name="SEC" />
                <Button soundEnabled={soundEnabled} name="ATC" />
                <Button soundEnabled={soundEnabled} name="MENU" />
            </ButtonRow>
        </ButtonGrid>
        <ButtonGrid x={115} y={985} width={260} height={260}>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="AIRPORT" />
                <Button soundEnabled={soundEnabled} name="" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="PREVPAGE" />
                <Button soundEnabled={soundEnabled} name="UP" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="NEXTPAGE" />
                <Button soundEnabled={soundEnabled} name="DOWN" />
            </ButtonRow>
        </ButtonGrid>
        <ButtonGrid x={435} y={1013} width={522} height={616}>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="A" />
                <Button soundEnabled={soundEnabled} name="B" />
                <Button soundEnabled={soundEnabled} name="C" />
                <Button soundEnabled={soundEnabled} name="D" />
                <Button soundEnabled={soundEnabled} name="E" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="F" />
                <Button soundEnabled={soundEnabled} name="G" />
                <Button soundEnabled={soundEnabled} name="H" />
                <Button soundEnabled={soundEnabled} name="I" />
                <Button soundEnabled={soundEnabled} name="J" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="K" />
                <Button soundEnabled={soundEnabled} name="L" />
                <Button soundEnabled={soundEnabled} name="M" />
                <Button soundEnabled={soundEnabled} name="N" />
                <Button soundEnabled={soundEnabled} name="O" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="P" />
                <Button soundEnabled={soundEnabled} name="Q" />
                <Button soundEnabled={soundEnabled} name="R" />
                <Button soundEnabled={soundEnabled} name="S" />
                <Button soundEnabled={soundEnabled} name="T" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="U" />
                <Button soundEnabled={soundEnabled} name="V" />
                <Button soundEnabled={soundEnabled} name="W" />
                <Button soundEnabled={soundEnabled} name="X" />
                <Button soundEnabled={soundEnabled} name="Y" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="Z" />
                <Button soundEnabled={soundEnabled} name="DIV" />
                <Button soundEnabled={soundEnabled} name="SP" />
                <Button soundEnabled={soundEnabled} name="OVFY" />
                <Button soundEnabled={soundEnabled} name="CLR" />
            </ButtonRow>
        </ButtonGrid>
        <ButtonGrid x={128} y={1250} width={300} height={375}>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="1" />
                <Button soundEnabled={soundEnabled} name="2" />
                <Button soundEnabled={soundEnabled} name="3" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="4" />
                <Button soundEnabled={soundEnabled} name="5" />
                <Button soundEnabled={soundEnabled} name="6" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="7" />
                <Button soundEnabled={soundEnabled} name="8" />
                <Button soundEnabled={soundEnabled} name="9" />
            </ButtonRow>
            <ButtonRow>
                <Button soundEnabled={soundEnabled} name="DOT" />
                <Button soundEnabled={soundEnabled} name="0" />
                <Button soundEnabled={soundEnabled} name="PLUSMINUS" />
            </ButtonRow>
        </ButtonGrid>
    </div>
);
