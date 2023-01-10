import React, { FC, MouseEventHandler } from 'react';

export interface LoaderProps {
    title: string;
    description: string;
}

export const Loader: FC<LoaderProps> = ({ title, description }) => {

    return (
        <div className="flex flex-col h-full flex-grow gap-y-5 justify-center items-center text-gray-100">
            <span className="text-5xl font-semibold">{title}</span>
            <span className="w-3/5 text-center text-2xl">{description}</span>
        </div>
    );
};
