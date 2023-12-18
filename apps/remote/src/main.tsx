import React from 'react';
import ReactDOM from 'react-dom/client';
import { applicationStore } from './store';
import { Provider } from 'react-redux';
import { Application } from './Application';

import './index.scss';
import { ModalContextProvider } from './modals/ModalContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={applicationStore}>
      <ModalContextProvider>
        <Application />
      </ModalContextProvider>
    </Provider>
  </React.StrictMode>,
);
