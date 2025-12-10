
import React from 'react';
import { OnNavigate, NavigationType } from '../types';

// --- SMART LINK ---
// A generic link component to navigate between views
interface SmartLinkProps {
    type: NavigationType;
    value: string;
    label?: React.ReactNode;
    onNavigate: OnNavigate;
    className?: string;
}

export const SmartLink: React.FC<SmartLinkProps> = ({ type, value, label, onNavigate, className = '' }) => {
    if (!value) return <span className="text-gray-400">-</span>;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onNavigate(type, value);
    };

    return (
        <button 
            onClick={handleClick}
            className={`font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline focus:outline-none transition-colors text-left ${className}`}
            title={`Go to ${type} details`}
        >
            {label || value}
        </button>
    );
};

// --- LOT NUMBER DISPLAY ---
// Splits "LV3-10023" into "LV3-" (dimmed) and "10023" (bold/highlighted)
export const LotNumberDisplay: React.FC<{ value: string; className?: string }> = ({ value, className = '' }) => {
    if (!value) return <span className="text-gray-400">-</span>;
    
    // Attempt to split by dash or space to find the sequence number
    const match = value.match(/^([a-zA-Z0-9]+)[-\s]+(\d+)$/);
    
    if (match) {
        return (
            <span className={`font-mono inline-flex items-baseline ${className}`}>
                <span className="text-xs text-gray-400 dark:text-gray-500 select-none mr-0.5">{match[1]}-</span>
                <span className="font-bold text-gray-900 dark:text-white tracking-wide">{match[2]}</span>
            </span>
        );
    }

    return <span className={`font-mono font-medium ${className}`}>{value}</span>;
};

// --- CUSTOMER BADGE ---
export const CustomerBadge: React.FC<{ name: string }> = ({ name }) => {
    let code = name.substring(0, 2).toUpperCase();
    let style = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';

    if (name.includes('Alliance')) {
        code = 'AL';
        style = 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-800';
    } else if (name.includes('PHSA')) {
        code = 'PH';
        style = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
    } else if (name.includes('PADM')) {
        code = 'PA';
        style = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
    }

    return (
        <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase w-8 ${style}`}>
            {code}
        </span>
    );
};

// --- COMPANY LOGO STYLES ---
const CompanyWordmark: React.FC<{ name: string }> = ({ name }) => {
    if (name === 'Alliance') {
        // Logo Match: Blue, Sans-serif, Title Case
        return <span className="font-sans font-bold text-[#1e40af] dark:text-blue-400 tracking-tight text-sm">Alliance</span>;
    }
    if (name === 'PHSA') {
        // Logo Match: Grey, Serif (Institutional look)
        return <span className="font-serif font-bold text-gray-600 dark:text-gray-300 tracking-wide text-sm">PHSA</span>;
    }
    if (name === 'PADM') {
        // Logo Match: Heavy Black, Sans-serif
        return <span className="font-sans font-black text-gray-900 dark:text-white tracking-normal text-sm">PADM</span>;
    }
    return <span className="font-bold text-gray-700 dark:text-gray-300 text-sm">{name}</span>;
};

// --- PRODUCT SMART BADGE ---
// Format: [CUSTOMER LOGO] Product Name [Color Pill]
export const ProductBadge: React.FC<{ name: string; hideCustomer?: boolean; hideLevel?: boolean }> = ({ name, hideCustomer = false, hideLevel = false }) => {
    // 1. Identify Color & Style
    let color = '';
    let colorStyle = '';
    
    if (name.includes('Blue')) { 
        color = 'Blue'; 
        colorStyle = 'border-blue-400 text-blue-700 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300'; 
    }
    else if (name.includes('White')) { 
        color = 'White'; 
        colorStyle = 'border-gray-300 text-gray-700 bg-white dark:border-gray-500 dark:bg-gray-700 dark:text-gray-300'; 
    }
    else if (name.includes('Yellow')) { 
        color = 'Yellow'; 
        colorStyle = 'border-yellow-400 text-yellow-800 bg-yellow-50 dark:border-yellow-500 dark:bg-yellow-900/30 dark:text-yellow-300'; 
    }
    else if (name.includes('Pink')) { 
        color = 'Pink'; 
        colorStyle = 'border-pink-300 text-pink-700 bg-pink-50 dark:border-pink-500 dark:bg-pink-900/30 dark:text-pink-300'; 
    }

    // 2. Identify Customer
    const customers = ['PHSA', 'PADM', 'Alliance'];
    const customer = customers.find(c => name.startsWith(c)) || '';

    // 3. Isolate Middle Part (e.g., "Level 3")
    let middle = name;
    if (customer) middle = middle.replace(customer, '');
    if (color) middle = middle.replace(color, '');
    
    // 4. Optionally Hide Level (e.g. if header implies it)
    if (hideLevel) {
        middle = middle.replace(/Level\s*\d+/i, '');
    }

    middle = middle.trim();

    // If middle is empty (e.g. "Alliance Level 1 Blue" -> stripped to ""), we don't render text, just the pill.
    const showText = middle.length > 0;

    return (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
            {customer && !hideCustomer && (
                <div className="border-r border-gray-300 dark:border-gray-600 pr-3 mr-1">
                    <CompanyWordmark name={customer} />
                </div>
            )}
            
            {showText && (
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
                    {middle}
                </span>
            )}

            {color && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorStyle} shadow-sm uppercase tracking-wide`}>
                    {color}
                </span>
            )}
        </div>
    );
};

// --- CATEGORY ICON ---
export const CategoryIcon: React.FC<{ category: string, subCategory: string }> = ({ category, subCategory }) => {
    let icon = null;
    let colorClass = 'text-gray-400';

    if (category === 'Raw Materials') {
        if (subCategory === 'Fabrics') {
            // Roll icon
            icon = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />; 
            colorClass = 'text-indigo-500 dark:text-indigo-400';
        } else {
            // Components (Nosewire/Elastic) - Nut/Bolt or similar
            icon = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 2v1h-4V6a2 2 0 114-2v1a6 6 0 01-6 6h-1v4h1a6 6 0 016 6v1a2 2 0 11-4 2v-1h4v-1a6 6 0 01-6-6h-1v-4h1a6 6 0 016-6V6a2 2 0 01-4 2v-1z" />;
            colorClass = 'text-amber-500 dark:text-amber-400';
        }
    } else {
        if (subCategory === 'Boxes') {
            // Box icon
            icon = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />;
            colorClass = 'text-emerald-500 dark:text-emerald-400';
        } else {
            // Carton icon (Stacked)
            icon = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />;
            colorClass = 'text-stone-500 dark:text-stone-400';
        }
    }

    return (
        <svg className={`h-5 w-5 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {icon}
        </svg>
    );
}