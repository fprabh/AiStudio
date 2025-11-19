
import React from 'react';
import { View } from '../types';
import { Theme } from '../hooks/useTheme';

interface HeaderProps {
  setView: (view: View) => void;
  currentView: View;
  theme: Theme;
  toggleTheme: () => void;
}

const NavButton: React.FC<{
  label: string;
  viewName: View;
  currentView: View;
  onClick: (view: View) => void;
  icon: React.ReactElement;
}> = ({ label, viewName, currentView, onClick, icon }) => {
  const isActive = currentView === viewName;
  return (
    <button
      onClick={() => onClick(viewName)}
      className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
        isActive
          ? 'bg-brand-red text-white'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};

const Header: React.FC<HeaderProps> = ({ setView, currentView, theme, toggleTheme }) => {
  const iconClass = "h-5 w-5";
  const icons = {
      dashboard: <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>,
      inventory: <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>,
      transactions: <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>,
      settings: <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01.947-2.287c1.561-.379-1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>,
      addStock: <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>,
      logProduction: <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
      logShipment: <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /><path fillRule="evenodd" d="M3 4a2 2 0 00-2 2v5.5a3.5 3.5 0 003.5 3.5h9A3.5 3.5 0 0017 11.5V6a2 2 0 00-2-2H3zm12.5 7.5a2.5 2.5 0 00-2.5-2.5H3V6h12v5.5z" clipRule="evenodd" /><path d="M14 9H6V7h8v2z" /></svg>
  };

  const sunIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );

  const moonIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
    
  return (
    <header className="bg-white dark:bg-gray-800 shadow sticky top-0 z-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-end h-16">
          <div className="flex items-center">
            <nav className="flex items-center space-x-1 sm:space-x-2">
               <div className="flex items-center space-x-2 mr-2 sm:mr-4 border-r border-gray-200 dark:border-gray-600 pr-2 sm:pr-4">
                  <NavButton label="Add Stock" viewName="addStock" currentView={currentView} onClick={setView} icon={icons.addStock}/>
                  <NavButton label="Log Production" viewName="logProduction" currentView={currentView} onClick={setView} icon={icons.logProduction}/>
                  <NavButton label="Log Shipment" viewName="logShipment" currentView={currentView} onClick={setView} icon={icons.logShipment}/>
               </div>
               <NavButton label="Dashboard" viewName="dashboard" currentView={currentView} onClick={setView} icon={icons.dashboard}/>
               <NavButton label="Inventory" viewName="inventory" currentView={currentView} onClick={setView} icon={icons.inventory}/>
               <NavButton label="Transactions" viewName="transactions" currentView={currentView} onClick={setView} icon={icons.transactions}/>
               <NavButton label="Settings" viewName="settings" currentView={currentView} onClick={setView} icon={icons.settings}/>
            </nav>
            <button
                onClick={toggleTheme}
                className="ml-4 p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-red transition-colors duration-200"
                aria-label="Toggle theme"
            >
                {theme === 'light' ? moonIcon : sunIcon}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
