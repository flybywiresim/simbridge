import React, { FC, MouseEventHandler } from 'react';

export interface ClearBoxBorderProps {
    text: string;
}

export const ClearBoxBorder: FC<ClearBoxBorderProps> = ({ text }: ClearBoxBorderProps) => {

    return (
        <button
            // onClick={onClick}
            type="button"
            // disabled={isChanging}
            className={`flex flex-none w-96 h-48 rounded-md border-t-2 border-l-2 border-r-2 border-b-2 border-dotted px-2 pt-3 pb-2 text-left`}
        >

            {/* center text in button */}
            <div className="flex flex-col justify-center items-center h-full w-full">
                <p className="font-light">{text}</p>
            </div>


        </button>
    );
};
