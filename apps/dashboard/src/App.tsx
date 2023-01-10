import './assets/css/fbw.scss';
import './assets/css/dash.scss';
import './assets/css/toast.css';
import React, { useEffect, useState } from 'react';

import { Logo } from './components/Logo';
import { Loader } from './components/Loader';
import { NiceWithArrows } from './components/Buttons/NiceWithArrow';
import { ClearBoxBorder } from './components/Buttons/ClearBoxBorder';
import { ClearBox } from './components/Buttons/ClearBox';

function App() {
  return (
    <div className="flex flex-col h-screen bg-navy text-quasi-white">

      <div className="flex items-start justify-start space-x-4 bg-navy pt-7 pl-5">
        <Logo />
      </div>

      <div className="flex flex-row items-start justify-end space-x-4 bg-navy mr-96">
        <h2>A32NX - In Flight</h2>
      </div>


      <div className="flex flex-row gap-2 pt-32 pl-10">

        <div className="">
          <h1>Remote Displays</h1>
          <div className="flex flex-row gap-5 max-w-4xl flex-wrap">
            <NiceWithArrows text="MCDU" color="blue" />
            <NiceWithArrows text="flyPad" color="blue" />
            <NiceWithArrows text="PFD" color="blue" />
            <NiceWithArrows text="ND" color="blue" />
            <NiceWithArrows text="EWD" color="blue" />
            <NiceWithArrows text="SD" color="blue" />
          </div>
        </div>

        <div className="">
          <h1>Display Setups</h1>
          <div className="flex flex-row gap-5 max-w-4xl flex-wrap">
            <NiceWithArrows text="PFD+ND+MCDU" color="green" />
            <NiceWithArrows text="PFD+ND+EWD+SD" color="green" />
            <ClearBoxBorder text="Create new..." />
          </div>
        </div>

        {/* move this element to the right */}
        <div className="ml-96">
          <h1>SimBridge</h1>
          <div className="flex flex-row gap-5 max-w-3xl flex-wrap">
            <ClearBox title="Open" subtitle="Aircraft System Explorer" />
            <ClearBox title="Open" subtitle="Aircraft Persistence Data" />
          </div>
        </div>


      </div>

    </div>
  )
}

export default App
