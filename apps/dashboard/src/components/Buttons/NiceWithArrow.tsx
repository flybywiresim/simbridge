import React, { FC, MouseEventHandler } from 'react';

export interface NiceWithArrowsProps {
    text: string;
    color: string;
}

export const NiceWithArrows: FC<NiceWithArrowsProps> = ({ text, color }: NiceWithArrowsProps) => {

    let arrowColor: string;

    if (color === "blue") {
        arrowColor = "cyan-medium";
    } else if (color === "red") {
        arrowColor = "red";
    } else if (color === "green") {
        arrowColor = "utility-green";
    } else if (color === "amber") {
        arrowColor = "utility-amber";
    }

    return (
        <button
            // onClick={onClick}
            type="button"
            // disabled={isChanging}
            className={`flex flex-none w-96 h-48 rounded-md border-t-4 secon bg-utility-grey-blue px-2 pt-3 pb-2 text-left border-utility-${color}`}
        >
            <h2 className="break-before-left">{text}</h2>
            <p className={`absolute mt-32 ml-80 text-${arrowColor}`}>-{">"}</p>
        </button>
    );
};
