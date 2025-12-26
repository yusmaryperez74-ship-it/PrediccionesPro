import { LotteryId, DrawResult, Animal } from '../types';
import { LotoVenService } from './lotovenService';
import loteriaDehoyService from './loteriaDehoyService';

/**
 * SERVICIO DE RESULTADOS REALES - SOLO DATOS DE LOTOVEN
 * 
 * Este servicio maneja ÚNICAMENTE resultados reales obtenidos de LotoVen.
 * NO genera simulaciones ni datos ficticios.
 * Los resultados históricos son persistentes y no cambian.
 */

export interface RealHistoryEntry {
  date: string;
  hour: string;
  animal: Animal;
  animalData: Animal;
  number: string;
  source: 'LotoVen' | 'LoteriaDehoy' | 'Manual';
  timestamp: number; // Para garantizar persistencia
}

export interface RealResultsResponse {
  success: boolean;
  draws: DrawResult[];
  history: RealHistoryEntry[];
  sources: string[];
  lastUpdate: string;
  totalResults: number;
}

export class RealResultsService {
  private static HISTORY_CACHE_KEY = 'real_history_persistent_v1';
  private static RESULTS_CACHE_KEY = 'real_results_today_v1';
  private static CACHE_DURATION = 2 * 60 * 1000; // 2 minutos para resultados del día
  
  /**
   * Obtener resultados reales del día actual desde LotoVen
   */
  static async getTodayResults(lotteryId: LotteryId): Promise<{ draws: DrawResult[], sources: string[] }> {
    console.log(`🔍 [RealResults] Fetching today's results for ${lotteryId} from LotoVen...`);
    
    try {
      // Verificar cache de resultados del día
      const cachedToday = this.getCachedTodayResults(lotteryId);
      if (cachedToday) {
        console.log(`📦 [RealResults] Using cached today results: ${cachedToday.draws.length} draws`);
        return cachedToday;
      }
      
      // Obtener desde LotoVen
      const lotovenResults = await LotoVenService.getResults(lotteryId);
      
      if (lotovenResults.draws.length === 0) {
        console.warn(`⚠️ [RealResults] No results from LotoVen for ${lotteryId}`);
        return { draws: [], sources: ['LotoVen - No results today'] };
      }
      
      // Convertir a formato DrawResult
      const today = new Date();
      const venezuelaTime = new Date(today.getTime() - (4 * 60 * 60 * 1000)); // UTC-4
      
      const drawResults: DrawResult[] = lotovenResults.draws.map(draw => ({
        hour: draw.hour || '00:00',
        label: `${draw.hour || '00:00'}`,
        animal: draw.animal || null,
        isCompleted: true,
        isActive: false,
        isNext: false
      }));
      
      // Guardar en cache
      this.cacheTodayResults(lotteryId, { draws: drawResults, sources: lotovenResults.sources });
      
      console.log(`✅ [RealResults] Loaded ${drawResults.length} real results for ${lotteryId}`);
      return { draws: drawResults, sources: lotovenResults.sources };
      
    } catch (error: any) {
      console.error(`❌ [RealResults] Error fetching today results:`, error);
      return { draws: [], sources: [`Error: ${error?.message || 'Unknown'}`] };
    }
  }
  
  /**
   * Obtener historial completo persistente (SOLO datos reales)
   */
  static async getHistoricalResults(lotteryId: LotteryId): Promise<RealResultsResponse> {
    console.log(`📚 [RealResults] Loading historical results for ${lotteryId}...`);
    
    try {
      // Cargar historial persistente
      let persistentHistory = this.getPersistentHistory(lotteryId);
      
      // Obtener resultados del día actual
      const todayResults = await this.getTodayResults(lotteryId);
      
      // Agregar resultados de hoy al historial si no existen
      const today = new Date();
      const venezuelaTime = new Date(today.getTime() - (4 * 60 * 60 * 1000)); // UTC-4
      const todayStr = venezuelaTime.toISOString().split('T')[0];
      
      let newEntriesAdded = 0;
      
      todayResults.draws.forEach(draw => {
        if (draw.animal && draw.hour) {
          // Verificar si ya existe esta entrada
          const exists = persistentHistory.find(h => 
            h.date === todayStr && 
            h.hour === draw.hour && 
            h.animal.id === draw.animal!.id
          );
          
          if (!exists) {
            const newEntry: RealHistoryEntry = {
              date: todayStr,
              hour: draw.hour,
              animal: draw.animal,
              animalData: draw.animal,
              number: draw.animal.number,
              source: 'LotoVen',
              timestamp: Date.now()
            };
            
            persistentHistory.unshift(newEntry); // Agregar al inicio
            newEntriesAdded++;
          }
        }
      });
      
      // Guardar historial actualizado si hay nuevas entradas
      if (newEntriesAdded > 0) {
        this.savePersistentHistory(lotteryId, persistentHistory);
        console.log(`💾 [RealResults] Added ${newEntriesAdded} new entries to persistent history`);
      }
      
      // Ordenar por fecha y hora (más recientes primero)
      persistentHistory.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.hour.localeCompare(a.hour);
      });
      
      console.log(`✅ [RealResults] Loaded ${persistentHistory.length} historical entries for ${lotteryId}`);
      
      return {
        success: true,
        draws: todayResults.draws,
        history: persistentHistory,
        sources: todayResults.sources,
        lastUpdate: new Date().toISOString(),
        totalResults: persistentHistory.length
      };
      
    } catch (error: any) {
      console.error(`❌ [RealResults] Error loading historical results:`, error);
      
      return {
        success: false,
        draws: [],
        history: [],
        sources: [`Error: ${error?.message || 'Unknown'}`],
        lastUpdate: new Date().toISOString(),
        totalResults: 0
      };
    }
  }
  
  /**
   * Cargar historial masivo desde LoteriaDehoy (una sola vez)
   */
  static async loadMassiveHistoricalData(lotteryId: LotteryId, maxPaginas: number = 10): Promise<{
    success: boolean;
    loaded: number;
    duplicates: number;
    errors: number;
  }> {
    console.log(`📚 [RealResults] Loading massive historical data for ${lotteryId} from LoteriaDehoy...`);
    
    try {
      // Verificar si ya se cargaron datos masivos
      const lastMassiveLoad = localStorage.getItem(`massive_load_${lotteryId}`);
      if (lastMassiveLoad) {
        const lastDate = new Date(lastMassiveLoad);
        const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSince < 7) { // Solo recargar si han pasado más de 7 días
          console.log(`⏭️ [RealResults] Massive data already loaded recently (${Math.floor(daysSince)} days ago)`);
          return { success: true, loaded: 0, duplicates: 0, errors: 0 };
        }
      }
      
      // Obtener datos históricos masivos
      const lotteryName = lotteryId === 'LOTTO_ACTIVO' ? 'Lotto Activo' : 'Guácharo Activo';
      const historicalData = await loteriaDehoyService.obtenerResultados(lotteryName as any, maxPaginas);
      
      if (historicalData.length === 0) {
        console.warn(`⚠️ [RealResults] No historical data obtained from LoteriaDehoy`);
        return { success: false, loaded: 0, duplicates: 0, errors: 0 };
      }
      
      // Convertir al formato de la aplicación
      const convertedData = loteriaDehoyService.convertirAFormatoApp(historicalData);
      
      // Cargar historial existente
      let existingHistory = this.getPersistentHistory(lotteryId);
      
      let loaded = 0;
      let duplicates = 0;
      let errors = 0;
      
      // Procesar cada resultado histórico
      for (const item of convertedData) {
        try {
          if (item.lotteryType !== (lotteryId === 'LOTTO_ACTIVO' ? 'lotto-activo' : 'guacharo-activo')) continue; // Solo procesar la lotería solicitada
          
          // Verificar si ya existe
          const exists = existingHistory.find(h => 
            h.date === item.date && 
            h.hour === item.time &&
            h.number === item.animalNumber
          );
          
          if (exists) {
            duplicates++;
            continue;
          }
          
          // Buscar el animal correspondiente
          const animal = this.findAnimalByNumber(item.animalNumber);
          if (!animal) {
            console.warn(`⚠️ Animal not found for number: ${item.animalNumber}`);
            errors++;
            continue;
          }
          
          // Crear nueva entrada histórica
          const newEntry: RealHistoryEntry = {
            date: item.date,
            hour: item.time,
            animal: animal,
            animalData: animal,
            number: item.animalNumber,
            source: 'LoteriaDehoy',
            timestamp: new Date(item.timestamp).getTime()
          };
          
          existingHistory.push(newEntry);
          loaded++;
          
        } catch (error) {
          console.error(`❌ Error processing historical entry:`, error);
          errors++;
        }
      }
      
      // Ordenar y guardar historial actualizado
      existingHistory.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.hour.localeCompare(a.hour);
      });
      
      this.savePersistentHistory(lotteryId, existingHistory);
      
      // Marcar como cargado masivamente
      localStorage.setItem(`massive_load_${lotteryId}`, new Date().toISOString());
      
      console.log(`✅ [RealResults] Massive load completed: ${loaded} loaded, ${duplicates} duplicates, ${errors} errors`);
      
      return { success: true, loaded, duplicates, errors };
      
    } catch (error: any) {
      console.error(`❌ [RealResults] Error in massive historical load:`, error);
      return { success: false, loaded: 0, duplicates: 0, errors: 1 };
    }
  }
  
  /**
   * Buscar animal por número
   */
  private static findAnimalByNumber(number: string): Animal | null {
    // Mapeo básico de números a animales (esto debería venir de constants.ts)
    const animalMap: { [key: string]: Animal } = {
      '00': { id: '00', number: '00', name: 'Delfín', emoji: '🐬' },
      '01': { id: '01', number: '01', name: 'Carnero', emoji: '🐏' },
      '02': { id: '02', number: '02', name: 'Toro', emoji: '🐂' },
      '03': { id: '03', number: '03', name: 'Ciempiés', emoji: '🐛' },
      '04': { id: '04', number: '04', name: 'Alacrán', emoji: '🦂' },
      '05': { id: '05', number: '05', name: 'León', emoji: '🦁' },
      '06': { id: '06', number: '06', name: 'Rana', emoji: '🐸' },
      '07': { id: '07', number: '07', name: 'Perico', emoji: '🦜' },
      '08': { id: '08', number: '08', name: 'Ratón', emoji: '🐭' },
      '09': { id: '09', number: '09', name: 'Águila', emoji: '🦅' },
      '10': { id: '10', number: '10', name: 'Tigre', emoji: '🐅' },
      '11': { id: '11', number: '11', name: 'Gato', emoji: '🐱' },
      '12': { id: '12', number: '12', name: 'Caballo', emoji: '🐴' },
      '13': { id: '13', number: '13', name: 'Mono', emoji: '🐵' },
      '14': { id: '14', number: '14', name: 'Paloma', emoji: '🕊️' },
      '15': { id: '15', number: '15', name: 'Zorro', emoji: '🦊' },
      '16': { id: '16', number: '16', name: 'Oso', emoji: '🐻' },
      '17': { id: '17', number: '17', name: 'Pavo', emoji: '🦃' },
      '18': { id: '18', number: '18', name: 'Burro', emoji: '🫏' },
      '19': { id: '19', number: '19', name: 'Chivo', emoji: '🐐' },
      '20': { id: '20', number: '20', name: 'Cochino', emoji: '🐷' },
      '21': { id: '21', number: '21', name: 'Gallo', emoji: '🐓' },
      '22': { id: '22', number: '22', name: 'Camello', emoji: '🐪' },
      '23': { id: '23', number: '23', name: 'Cebra', emoji: '🦓' },
      '24': { id: '24', number: '24', name: 'Iguana', emoji: '🦎' },
      '25': { id: '25', number: '25', name: 'Gallina', emoji: '🐔' },
      '26': { id: '26', number: '26', name: 'Vaca', emoji: '🐄' },
      '27': { id: '27', number: '27', name: 'Perro', emoji: '🐶' },
      '28': { id: '28', number: '28', name: 'Zamuro', emoji: '🦅' },
      '29': { id: '29', number: '29', name: 'Elefante', emoji: '🐘' },
      '30': { id: '30', number: '30', name: 'Caimán', emoji: '🐊' },
      '31': { id: '31', number: '31', name: 'Lapa', emoji: '🦜' },
      '32': { id: '32', number: '32', name: 'Ardilla', emoji: '🐿️' },
      '33': { id: '33', number: '33', name: 'Pescado', emoji: '🐟' },
      '34': { id: '34', number: '34', name: 'Venado', emoji: '🦌' },
      '35': { id: '35', number: '35', name: 'Jirafa', emoji: '🦒' },
      '36': { id: '36', number: '36', name: 'Culebra', emoji: '🐍' }
    };
    
    return animalMap[number] || null;
  }
  static addManualResult(lotteryId: LotteryId, date: string, hour: string, animal: Animal): boolean {
    try {
      const history = this.getPersistentHistory(lotteryId);
      
      // Verificar si ya existe
      const exists = history.find(h => 
        h.date === date && 
        h.hour === hour
      );
      
      if (exists) {
        console.warn(`⚠️ [RealResults] Entry already exists for ${date} ${hour}`);
        return false;
      }
      
      // Agregar nueva entrada
      const newEntry: RealHistoryEntry = {
        date,
        hour,
        animal,
        animalData: animal,
        number: animal.number,
        source: 'Manual',
        timestamp: Date.now()
      };
      
      history.unshift(newEntry);
      this.savePersistentHistory(lotteryId, history);
      
      console.log(`✅ [RealResults] Added manual entry: ${date} ${hour} - ${animal.name}`);
      return true;
      
    } catch (error) {
      console.error(`❌ [RealResults] Error adding manual result:`, error);
      return false;
    }
  }
  
  /**
   * Obtener estadísticas del historial real
   */
  static getHistoryStats(lotteryId: LotteryId): {
    totalEntries: number;
    dateRange: { from: string, to: string };
    sources: string[];
    lastUpdate: string;
  } {
    const history = this.getPersistentHistory(lotteryId);
    
    if (history.length === 0) {
      return {
        totalEntries: 0,
        dateRange: { from: 'N/A', to: 'N/A' },
        sources: [],
        lastUpdate: 'Never'
      };
    }
    
    const dates = history.map(h => h.date).sort();
    const sources = [...new Set(history.map(h => h.source))];
    const lastEntry = history.reduce((latest, current) => 
      current.timestamp > latest.timestamp ? current : latest
    );
    
    return {
      totalEntries: history.length,
      dateRange: { 
        from: dates[0], 
        to: dates[dates.length - 1] 
      },
      sources,
      lastUpdate: new Date(lastEntry.timestamp).toISOString()
    };
  }
  
  /**
   * Limpiar cache de resultados del día (forzar actualización)
   */
  static clearTodayCache(lotteryId?: LotteryId): void {
    try {
      if (lotteryId) {
        localStorage.removeItem(`${this.RESULTS_CACHE_KEY}_${lotteryId}`);
        console.log(`🧹 [RealResults] Cleared today cache for ${lotteryId}`);
      } else {
        // Limpiar todo el cache de resultados del día
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(this.RESULTS_CACHE_KEY)) {
            localStorage.removeItem(key);
          }
        });
        console.log(`🧹 [RealResults] Cleared all today cache`);
      }
    } catch (error) {
      console.warn('Failed to clear today cache:', error);
    }
  }
  
  /**
   * Gestión de historial persistente
   */
  private static getPersistentHistory(lotteryId: LotteryId): RealHistoryEntry[] {
    try {
      const stored = localStorage.getItem(`${this.HISTORY_CACHE_KEY}_${lotteryId}`);
      if (!stored) return [];
      
      const data = JSON.parse(stored);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  
  private static savePersistentHistory(lotteryId: LotteryId, history: RealHistoryEntry[]): void {
    try {
      localStorage.setItem(`${this.HISTORY_CACHE_KEY}_${lotteryId}`, JSON.stringify(history));
    } catch (error) {
      console.warn('Failed to save persistent history:', error);
    }
  }
  
  /**
   * Gestión de cache de resultados del día
   */
  private static getCachedTodayResults(lotteryId: LotteryId): { draws: DrawResult[], sources: string[] } | null {
    try {
      const cached = localStorage.getItem(`${this.RESULTS_CACHE_KEY}_${lotteryId}`);
      if (!cached) return null;
      
      const data = JSON.parse(cached);
      const isExpired = Date.now() - data.timestamp > this.CACHE_DURATION;
      
      if (isExpired) return null;
      
      return {
        draws: data.draws,
        sources: data.sources
      };
    } catch {
      return null;
    }
  }
  
  private static cacheTodayResults(lotteryId: LotteryId, result: { draws: DrawResult[], sources: string[] }): void {
    try {
      const cacheData = {
        draws: result.draws,
        sources: result.sources,
        timestamp: Date.now()
      };
      localStorage.setItem(`${this.RESULTS_CACHE_KEY}_${lotteryId}`, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to cache today results:', error);
    }
  }
}