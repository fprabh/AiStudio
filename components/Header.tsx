
import React, { useState, useRef, useEffect } from 'react';
import { View } from '../types';
import { Theme } from '../hooks/useTheme';
import Logo from '../Logo.png';


interface HeaderProps {
  setView: (view: View) => void;
  currentView: View;
  theme: Theme;
  toggleTheme: () => void;
}

interface DropdownProps {
    label: string;
    icon: React.ReactElement;
    active: boolean;
    children: React.ReactNode;
}

const Dropdown: React.FC<DropdownProps> = ({ label, icon, active, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
                    active || isOpen
                        ? 'bg-gray-100 dark:bg-gray-700 text-brand-dark dark:text-white'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
            >
                {icon}
                <span className="hidden sm:inline">{label}</span>
                <svg className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50 py-1">
                    {children}
                </div>
            )}
        </div>
    );
};

const NavItem: React.FC<{
  label: string;
  viewName: View;
  currentView: View;
  onClick: (view: View) => void;
  icon?: React.ReactElement;
  isDropdownItem?: boolean;
}> = ({ label, viewName, currentView, onClick, icon, isDropdownItem = false }) => {
  const isActive = currentView === viewName;
  
  if (isDropdownItem) {
      return (
          <button
              onClick={() => onClick(viewName)}
              className={`w-full text-left block px-4 py-2 text-sm ${
                  isActive
                      ? 'bg-brand-light dark:bg-gray-700 text-brand-red font-medium'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
          >
              {label}
          </button>
      )
  }

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
      inventory: <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>,
      reports: <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" /><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" /></svg>,
      actions: <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>,
      settings: <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01.947-2.287c1.561-.379-1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>,
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
    
  const isReportView = ['transactions', 'shipments', 'productionHistory', 'stockHistory', 'lotHistory'].includes(currentView);
  const isActionView = ['addStock', 'logProduction', 'logShipment'].includes(currentView);

  return (
    <header className="bg-white dark:bg-gray-800 shadow sticky top-0 z-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 relative">
          <div className="flex items-center">
            <button
              onClick={() => setView('dashboard')}
              className="flex items-center mr-3 focus:outline-none"
              aria-label="Go to dashboard"
            >
              <img src={Logo} alt="Logo" className="h-8 w-auto" />
            </button>
            <nav className="flex items-center space-x-1 sm:space-x-2">
               
               <NavItem label="Dashboard" viewName="dashboard" currentView={currentView} onClick={setView} icon={icons.dashboard}/>
               <NavItem label="Inventory" viewName="inventory" currentView={currentView} onClick={setView} icon={icons.inventory}/>
               
               <div className="h-6 w-px bg-gray-200 dark:bg-gray-600 mx-2"></div>

               <Dropdown label="Reports" icon={icons.reports} active={isReportView}>
                    <NavItem label="Lot Traceability" viewName="lotHistory" currentView={currentView} onClick={setView} isDropdownItem />
                    <NavItem label="Production History" viewName="productionHistory" currentView={currentView} onClick={setView} isDropdownItem />
                    <NavItem label="Shipment History" viewName="shipments" currentView={currentView} onClick={setView} isDropdownItem />
                    <NavItem label="Incoming Stock" viewName="stockHistory" currentView={currentView} onClick={setView} isDropdownItem />
                    <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                    <NavItem label="All Transactions" viewName="transactions" currentView={currentView} onClick={setView} isDropdownItem />
               </Dropdown>

               <Dropdown label="Actions" icon={icons.actions} active={isActionView}>
                   <NavItem label="Add Stock" viewName="addStock" currentView={currentView} onClick={setView} isDropdownItem />
                   <NavItem label="Log Production" viewName="logProduction" currentView={currentView} onClick={setView} isDropdownItem />
                   <NavItem label="Log Shipment" viewName="logShipment" currentView={currentView} onClick={setView} isDropdownItem />
               </Dropdown>
            </nav>
          </div>

          <div className="flex items-center space-x-2">
            <NavItem label="Settings" viewName="settings" currentView={currentView} onClick={setView} icon={icons.settings}/>
            <button
                onClick={toggleTheme}
                className="ml-2 p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-red transition-colors duration-200"
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
