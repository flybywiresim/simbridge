import React from 'react';
import headerLogo from "../../assets/img/FBW-Tail.svg"

export const Logo = (): JSX.Element => (
    <div className="flex items-center justify-center space-x-4">
        <img style={{ width: 'auto', height: '50px' }} src={headerLogo} alt="" />
        <span className="text-4xl font-normal text-gray-100">SimBridge</span>
    </div>
);
