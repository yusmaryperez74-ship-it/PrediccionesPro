import React, { useState } from 'react';
import { LotteryId } from '../types';
import { RealResultsService } from '../services/realResultsService';
import loteriaDehoyService from '../services/loteriaDehoyService';

interface HistoricalDataLoaderProps {
  lotteryId: LotteryId;
  onDataLoaded?: (stats: any) => void;
}

interface LoadingStats {
  loaded: number;
  duplicates: number;
  errors: number;
  totalPages: number;
  currentPage: number;
  isLoading: boolean;
}

export const HistoricalDataLoader: React.FC<HistoricalDataLoaderProps> = ({
  lotteryId,
  onDataLoaded
}) => {
  const [stats, setStats] = useState<LoadingStats>({
    loaded: 0,
    duplicates: 0,
    errors: 0,
    totalPages: 0,
    currentPage: 0,
    isLoading: false
  });

  const [serviceStats, setServiceStats] = useState<any>(null);

  const loadHistoricalData = async (maxPages: number = 10) => {
    setStats(prev => ({ ...prev, isLoading: true, totalPages: maxPages }));
    
    try {
      console.log(`🚀 Iniciando carga masiva de datos históricos para ${lotteryId}...`);
      
      // Cargar datos masivos
      const result = await RealResultsService.loadMassiveHistoricalData(lotteryId, maxPages);
      
      setStats(prev => ({
        ...prev,
        loaded: result.loaded,
        duplicates: result.duplicates,
        errors: result.errors,
        isLoading: false
      }));

      // Obtener estadísticas actualizadas
      const updatedStats = RealResultsService.getHistoryStats(lotteryId);
      setServiceStats(updatedStats);
      
      if (onDataLoaded) {
        onDataLoaded(updatedStats);
      }
      
      console.log(`✅ Carga masiva completada:`, result);
      
    } catch (error) {
      console.error('❌ Error en carga masiva:', error);
      setStats(prev => ({ ...prev, isLoading: false, errors: prev.errors + 1 }));
    }
  };

  const getServiceStats = async () => {
    try {
      const stats = await loteriaDehoyService.obtenerEstadisticas();
      setServiceStats(stats);
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
    }
  };

  React.useEffect(() => {
    getServiceStats();
  }, []);

  const lotteryName = lotteryId === 'LOTTO_ACTIVO' ? 'Lotto Activo' : 'Guácharo Activo';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          📚 Carga de Datos Históricos - {lotteryName}
        </h3>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Fuente: LoteriaDehoy.com
        </div>
      </div>

      {/* Estadísticas del servicio */}
      {serviceStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <div className="text-sm text-blue-600 dark:text-blue-400">Total Resultados</div>
            <div className="text-xl font-bold text-blue-700 dark:text-blue-300">
              {serviceStats.totalResultados?.toLocaleString() || 0}
            </div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
            <div className="text-sm text-green-600 dark:text-green-400">Lotto Activo</div>
            <div className="text-xl font-bold text-green-700 dark:text-green-300">
              {serviceStats.lottoActivo?.toLocaleString() || 0}
            </div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
            <div className="text-sm text-purple-600 dark:text-purple-400">Guácharo Activo</div>
            <div className="text-xl font-bold text-purple-700 dark:text-purple-300">
              {serviceStats.guacharoActivo?.toLocaleString() || 0}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
            <div className="text-sm text-gray-600 dark:text-gray-400">Última Actualización</div>
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {serviceStats.ultimaActualizacion !== 'Nunca' 
                ? new Date(serviceStats.ultimaActualizacion).toLocaleDateString()
                : 'Nunca'
              }
            </div>
          </div>
        </div>
      )}

      {/* Controles de carga */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => loadHistoricalData(5)}
            disabled={stats.isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {stats.isLoading ? '⏳ Cargando...' : '📥 Cargar 5 Páginas'}
          </button>
          <button
            onClick={() => loadHistoricalData(10)}
            disabled={stats.isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {stats.isLoading ? '⏳ Cargando...' : '📥 Cargar 10 Páginas'}
          </button>
          <button
            onClick={() => loadHistoricalData(20)}
            disabled={stats.isLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {stats.isLoading ? '⏳ Cargando...' : '📥 Cargar 20 Páginas (Completo)'}
          </button>
        </div>

        {/* Estadísticas de carga */}
        {(stats.loaded > 0 || stats.duplicates > 0 || stats.errors > 0) && (
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">
              📊 Resultados de la Última Carga:
            </h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="text-green-600 dark:text-green-400 font-bold text-lg">
                  {stats.loaded}
                </div>
                <div className="text-gray-600 dark:text-gray-400">Nuevos</div>
              </div>
              <div className="text-center">
                <div className="text-yellow-600 dark:text-yellow-400 font-bold text-lg">
                  {stats.duplicates}
                </div>
                <div className="text-gray-600 dark:text-gray-400">Duplicados</div>
              </div>
              <div className="text-center">
                <div className="text-red-600 dark:text-red-400 font-bold text-lg">
                  {stats.errors}
                </div>
                <div className="text-gray-600 dark:text-gray-400">Errores</div>
              </div>
            </div>
          </div>
        )}

        {/* Barra de progreso */}
        {stats.isLoading && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ 
                width: stats.totalPages > 0 
                  ? `${(stats.currentPage / stats.totalPages) * 100}%` 
                  : '0%' 
              }}
            />
          </div>
        )}
      </div>

      {/* Información importante */}
      <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <div className="flex items-start">
          <div className="text-yellow-600 dark:text-yellow-400 mr-2">⚠️</div>
          <div className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Importante:</strong> La carga masiva solo se ejecuta una vez por semana para evitar sobrecargar el servidor. 
            Los datos se almacenan permanentemente y no se modifican una vez guardados.
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="text-xs text-blue-800 dark:text-blue-200">
          <strong>Fuente de Datos:</strong> Los datos históricos se obtienen de loteriadehoy.com mediante scraping automatizado. 
          Todos los resultados son verificados y almacenados de forma permanente.
        </div>
      </div>
    </div>
  );
};