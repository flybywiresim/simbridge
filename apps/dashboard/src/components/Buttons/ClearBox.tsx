import React, { FC, MouseEventHandler } from 'react';

export interface ClearBoxProps {
    title: string;
    subtitle: string;
}

export const ClearBox: FC<ClearBoxProps> = ({ title, subtitle }: ClearBoxProps) => {

    return (
        <button
            // onClick={onClick}
            type="button"
            // disabled={isChanging}
            className={`flex flex-none w-full h-48 rounded-md bg-utility-grey-blue px-2 pt-3 pb-2 text-left`}
        >

            {/* center text in button */}
            <div className="flex flex-col justify-center gap-0 h-full w-full">
                <h5 className="font-light">{title}</h5>
                <h2 className="font-bold">{subtitle}</h2>
            </div>


        </button>
    );
};
