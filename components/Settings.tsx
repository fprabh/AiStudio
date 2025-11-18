import React, { useState, useRef, useEffect } from 'react';
import { useInventory } from '../hooks/useInventory';
import { INVENTORY_ITEMS, FINISHED_PRODUCTS } from '../constants';
import { InventoryItemId, ProductId } from '../types';

type SettingsProps = {
    settings: ReturnType<typeof useInventory>['settings'];
    updateSettings: ReturnType<typeof useInventory>['updateSettings'];
    exportData: ReturnType<typeof useInventory>['exportData'];
    importData: ReturnType<typeof useInventory>['importData'];
};

const Settings: React.FC<SettingsProps> = ({ settings: initialSettings, updateSettings, exportData, importData }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [localSettings, setLocalSettings] = useState(initialSettings);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    
    useEffect(() => {
        setLocalSettings(initialSettings);
    }, [initialSettings]);

    const handleSettingsChange = (category: keyof typeof localSettings, id: string, field: string, value: any) => {
        setLocalSettings(prev => {
            const newCategoryState = { ...prev[category] };
            if (category === 'materialUsage') {
                 (newCategoryState as any)[id] = value;
            } else if (typeof newCategoryState[id as keyof typeof newCategoryState] === 'object') {
                 (newCategoryState as any)[id][field] = value;
            } else {
                 (newCategoryState as any)[id] = value;
            }
            return { ...prev, [category]: newCategoryState };
        });
    };
    
    const handleSaveSettings = () => {
        setSaveStatus('saving');
        updateSettings(localSettings);
        setTimeout(() => setSaveStatus('saved'), 1000);
        setTimeout(() => setSaveStatus('idle'), 3000);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result;
            if (typeof text === 'string') {
                try {
                    setImportStatus('idle');
                    setErrorMessage('');
                    await importData(text);
                    setImportStatus('success');
                    setTimeout(() => setImportStatus('idle'), 5000);
                } catch (error) {
                    setImportStatus('error');
                    setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred.');
                    setTimeout(() => setImportStatus('idle'), 5000);
                }
            }
        };
        reader.onerror = () => {
            setImportStatus('error');
            setErrorMessage('Failed to read the file.');
        };
        reader.readAsText(file);
        if(event.target) {
            event.target.value = '';
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h2>
                 <button onClick={handleSaveSettings} className="px-6 py-2 font-semibold text-white bg-brand-red rounded-md hover:bg-red-700 disabled:bg-gray-400 transition-all duration-200">
                    {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Settings'}
                </button>
            </div>
            
            {/* Product Formulas */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Product Formulas</h3>
                 <div className="overflow-x-auto">
                     <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase">Product</th>
                                <th className="px-4 py-2 text-center text-xs font-medium uppercase">Masks/Box</th>
                                <th className="px-4 py-2 text-center text-xs font-medium uppercase">Boxes/Carton</th>
                                <th className="px-4 py-2 text-center text-xs font-medium uppercase">Cartons/Pallet</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {FINISHED_PRODUCTS.map(product => (
                                <tr key={product.id}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">{product.name}</td>
                                    <td className="px-4 py-2"><input type="number" className="w-24 text-center bg-gray-100 dark:bg-gray-700 rounded p-1" value={localSettings.productFormulas[product.id].masksPerBox} onChange={e => handleSettingsChange('productFormulas', product.id, 'masksPerBox', parseInt(e.target.value) || 0)} /></td>
                                    <td className="px-4 py-2"><input type="number" className="w-24 text-center bg-gray-100 dark:bg-gray-700 rounded p-1" value={localSettings.productFormulas[product.id].boxesPerCarton} onChange={e => handleSettingsChange('productFormulas', product.id, 'boxesPerCarton', parseInt(e.target.value) || 0)} /></td>
                                    <td className="px-4 py-2"><input type="number" className="w-24 text-center bg-gray-100 dark:bg-gray-700 rounded p-1" value={localSettings.productFormulas[product.id].cartonsPerPallet} onChange={e => handleSettingsChange('productFormulas', product.id, 'cartonsPerPallet', parseInt(e.target.value) || 0)} /></td>
                                </tr>
                            ))}
                        </tbody>
                     </table>
                 </div>
            </div>

             {/* Material Usage Settings */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Material Usage / Capacity</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label htmlFor="fabricPerMask" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fabric Usage (meters/mask)</label>
                        <input id="fabricPerMask" type="number" step="0.001" className="w-full text-left bg-gray-100 dark:bg-gray-700 rounded p-1.5 mt-1 border-gray-300 focus:ring-brand-red focus:border-brand-red" value={localSettings.materialUsage.fabricPerMask} onChange={e => handleSettingsChange('materialUsage', 'fabricPerMask', '', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                        <label htmlFor="nosewirePerRoll" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Masks per Roll (Nosewire)</label>
                        <input id="nosewirePerRoll" type="number" className="w-full text-left bg-gray-100 dark:bg-gray-700 rounded p-1.5 mt-1 border-gray-300 focus:ring-brand-red focus:border-brand-red" value={localSettings.materialUsage.masksPerRollNosewire} onChange={e => handleSettingsChange('materialUsage', 'masksPerRollNosewire', '', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                        <label htmlFor="elasticPerRoll" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Masks per Roll (Elastic)</label>
                        <input id="elasticPerRoll" type="number" className="w-full text-left bg-gray-100 dark:bg-gray-700 rounded p-1.5 mt-1 border-gray-300 focus:ring-brand-red focus:border-brand-red" value={localSettings.materialUsage.masksPerRollElastic} onChange={e => handleSettingsChange('materialUsage', 'masksPerRollElastic', '', parseFloat(e.target.value) || 0)} />
                    </div>
                </div>
            </div>

            {/* Inventory Item Settings */}
             <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Inventory Item Settings</h3>
                 <div className="overflow-x-auto">
                     <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase">Item</th>
                                <th className="px-4 py-2 text-center text-xs font-medium uppercase">Rejection (%)</th>
                                <th className="px-4 py-2 text-center text-xs font-medium uppercase">Low Threshold</th>
                                <th className="px-4 py-2 text-center text-xs font-medium uppercase">Ideal Threshold</th>
                                <th className="px-4 py-2 text-center text-xs font-medium uppercase">Bypass</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {INVENTORY_ITEMS.map(item => (
                                <tr key={item.id}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">{item.name}</td>
                                    <td className="px-4 py-2"><input type="number" step="0.1" className="w-24 text-center bg-gray-100 dark:bg-gray-700 rounded p-1" value={localSettings.rejectionCoefficients[item.id]} onChange={e => handleSettingsChange('rejectionCoefficients', item.id, '', parseFloat(e.target.value) || 0)} /></td>
                                    <td className="px-4 py-2"><input type="number" className="w-24 text-center bg-gray-100 dark:bg-gray-700 rounded p-1" value={localSettings.stockThresholds[item.id].low} onChange={e => handleSettingsChange('stockThresholds', item.id, 'low', parseInt(e.target.value) || 0)} /> <span className="text-xs text-gray-500">{item.unit}</span></td>
                                    <td className="px-4 py-2"><input type="number" className="w-24 text-center bg-gray-100 dark:bg-gray-700 rounded p-1" value={localSettings.stockThresholds[item.id].ideal} onChange={e => handleSettingsChange('stockThresholds', item.id, 'ideal', parseInt(e.target.value) || 0)} /> <span className="text-xs text-gray-500">{item.unit}</span></td>
                                    <td className="px-4 py-2 text-center"><input type="checkbox" className="h-5 w-5 rounded text-brand-red focus:ring-brand-red" checked={localSettings.bypassedItems[item.id]} onChange={e => handleSettingsChange('bypassedItems', item.id, '', e.target.checked)} /></td>
                                </tr>
                            ))}
                        </tbody>
                     </table>
                 </div>
            </div>

            {/* Data Management */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Data Management</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Export all your current inventory, transaction, and settings data into a single JSON file as a backup. You can import this file later to restore the application's state.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <button
                        onClick={exportData}
                        className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-dark hover:bg-brand-gray"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export Data
                    </button>
                    <button
                        onClick={handleImportClick}
                        className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Import Data
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".json"
                        onChange={handleFileChange}
                    />
                </div>
                {importStatus === 'success' && <p className="mt-4 text-sm text-green-600 dark:text-green-400">Data imported successfully!</p>}
                {importStatus === 'error' && <p className="mt-4 text-sm text-red-600 dark:text-red-400">Error: {errorMessage}</p>}
            </div>
        </div>
    );
};

export default Settings;