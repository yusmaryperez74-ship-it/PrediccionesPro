/**
 * Servicio para obtener datos históricos reales desde loteriadehoy.com
 * Equivalente TypeScript del script Python proporcionado
 */

interface HistoricalResult {
  loteria: string;
  fecha: string;
  hora: string;
  animal: string;
  numero: string;
}

interface ScrapingConfig {
  maxPaginas: number;
  delayMs: number;
  retries: number;
}

class LoteriaDehoyService {
  private readonly BASE_URLS = {
    'Lotto Activo': 'https://www.loteriadehoy.com/animalito/lottoactivo/historico/',
    'Guácharo Activo': 'https://www.loteriadehoy.com/animalito/guacharoactivo/historico/'
  };

  private readonly HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  };

  private readonly CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://cors-anywhere.herokuapp.com/',
    'https://thingproxy.freeboard.io/fetch/'
  ];

  private config: ScrapingConfig = {
    maxPaginas: 15,
    delayMs: 1000,
    retries: 3
  };

  /**
   * Obtiene resultados históricos de una lotería específica
   */
  async obtenerResultados(nombre: keyof typeof this.BASE_URLS, maxPaginas?: number): Promise<HistoricalResult[]> {
    const url = this.BASE_URLS[nombre];
    const paginas = maxPaginas || this.config.maxPaginas;
    const resultados: HistoricalResult[] = [];

    console.log(`📥 Iniciando scraping de ${nombre} - ${paginas} páginas máximo`);

    for (let pagina = 1; pagina <= paginas; pagina++) {
      console.log(`📄 ${nombre} – Página ${pagina}`);
      
      try {
        const paginaResultados = await this.scrapearPagina(url, pagina, nombre);
        
        if (paginaResultados.length === 0) {
          console.log(`⚠️ No hay más resultados en página ${pagina}, deteniendo...`);
          break;
        }

        resultados.push(...paginaResultados);
        
        // Delay entre requests para respetar el servidor
        if (pagina < paginas) {
          await this.delay(this.config.delayMs);
        }
        
      } catch (error) {
        console.error(`❌ Error en página ${pagina}:`, error);
        // Continuar con la siguiente página en caso de error
        continue;
      }
    }

    console.log(`✅ ${nombre}: ${resultados.length} resultados obtenidos`);
    return resultados;
  }

  /**
   * Scrapea una página específica
   */
  private async scrapearPagina(baseUrl: string, pagina: number, loteria: string): Promise<HistoricalResult[]> {
    const url = `${baseUrl}?page=${pagina}`;
    const resultados: HistoricalResult[] = [];

    for (let intento = 1; intento <= this.config.retries; intento++) {
      try {
        const html = await this.fetchWithProxy(url, intento);
        const parsed = this.parseHTML(html, loteria);
        
        if (parsed.length > 0) {
          return parsed;
        }
        
        if (intento === this.config.retries) {
          console.warn(`⚠️ No se encontraron datos en ${url} después de ${this.config.retries} intentos`);
        }
        
      } catch (error) {
        console.error(`❌ Intento ${intento}/${this.config.retries} falló para ${url}:`, error);
        
        if (intento < this.config.retries) {
          await this.delay(1000 * intento); // Backoff exponencial
        }
      }
    }

    return resultados;
  }

  /**
   * Fetch con proxy CORS y manejo de errores
   */
  private async fetchWithProxy(url: string, proxyIndex: number = 0): Promise<string> {
    const proxy = this.CORS_PROXIES[proxyIndex % this.CORS_PROXIES.length];
    const proxiedUrl = `${proxy}${encodeURIComponent(url)}`;

    const response = await fetch(proxiedUrl, {
      method: 'GET',
      headers: this.HEADERS,
      mode: 'cors'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  }

  /**
   * Parsea el HTML y extrae los resultados
   */
  private parseHTML(html: string, loteria: string): HistoricalResult[] {
    const resultados: HistoricalResult[] = [];
    
    try {
      // Crear un parser DOM temporal
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Buscar la tabla de resultados
      const filas = doc.querySelectorAll('table tbody tr');
      
      if (filas.length === 0) {
        // Intentar con selectores alternativos
        const filasAlt = doc.querySelectorAll('tr');
        console.log(`🔍 Filas encontradas con selector alternativo: ${filasAlt.length}`);
      }

      filas.forEach((fila) => {
        const cols = fila.querySelectorAll('td');
        
        if (cols.length >= 4) {
          const fecha = cols[0]?.textContent?.trim() || '';
          const hora = cols[1]?.textContent?.trim() || '';
          const numero = cols[2]?.textContent?.trim() || '';
          const animal = cols[3]?.textContent?.trim() || '';

          if (fecha && hora && numero && animal) {
            resultados.push({
              loteria,
              fecha,
              hora,
              animal,
              numero
            });
          }
        }
      });

    } catch (error) {
      console.error('❌ Error parseando HTML:', error);
    }

    return resultados;
  }

  /**
   * Obtiene todos los resultados históricos de ambas loterías
   */
  async obtenerTodosLosResultados(maxPaginas?: number): Promise<HistoricalResult[]> {
    const todos: HistoricalResult[] = [];
    
    console.log('🚀 Iniciando scraping completo de datos históricos...');
    
    for (const [nombre, url] of Object.entries(this.BASE_URLS)) {
      try {
        const datos = await this.obtenerResultados(nombre as keyof typeof this.BASE_URLS, maxPaginas);
        todos.push(...datos);
        
        // Delay entre loterías
        await this.delay(2000);
        
      } catch (error) {
        console.error(`❌ Error obteniendo datos de ${nombre}:`, error);
      }
    }

    console.log(`✅ Scraping completo: ${todos.length} resultados históricos obtenidos`);
    return todos;
  }

  /**
   * Convierte los resultados al formato usado por la aplicación
   */
  convertirAFormatoApp(resultados: HistoricalResult[]): any[] {
    return resultados.map(resultado => {
      // Mapear nombres de lotería
      const lotteryType = resultado.loteria === 'Lotto Activo' ? 'lotto-activo' : 'guacharo-activo';
      
      // Parsear fecha (formato esperado: DD/MM/YYYY o similar)
      const fechaParts = resultado.fecha.split('/');
      let fechaISO = resultado.fecha;
      
      if (fechaParts.length === 3) {
        const [dia, mes, año] = fechaParts;
        fechaISO = `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      }

      return {
        id: `${lotteryType}-${fechaISO}-${resultado.hora}`,
        date: fechaISO,
        time: resultado.hora,
        lotteryType,
        animalNumber: resultado.numero,
        animalName: resultado.animal,
        source: 'loteriadehoy.com',
        verified: true,
        timestamp: new Date().toISOString()
      };
    });
  }

  /**
   * Guarda los resultados en localStorage para persistencia
   */
  guardarResultados(resultados: HistoricalResult[]): void {
    try {
      const datosApp = this.convertirAFormatoApp(resultados);
      const datosExistentes = JSON.parse(localStorage.getItem('historical-results') || '[]');
      
      // Combinar y deduplicar
      const todosCombinados = [...datosExistentes, ...datosApp];
      const unicos = todosCombinados.filter((item, index, arr) => 
        arr.findIndex(x => x.id === item.id) === index
      );

      localStorage.setItem('historical-results', JSON.stringify(unicos));
      localStorage.setItem('last-historical-update', new Date().toISOString());
      
      console.log(`💾 Guardados ${unicos.length} resultados históricos únicos`);
      
    } catch (error) {
      console.error('❌ Error guardando resultados:', error);
    }
  }

  /**
   * Utility: Delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtiene estadísticas del scraping
   */
  async obtenerEstadisticas(): Promise<{
    totalResultados: number;
    lottoActivo: number;
    guacharoActivo: number;
    ultimaActualizacion: string;
  }> {
    const datos = JSON.parse(localStorage.getItem('historical-results') || '[]');
    
    return {
      totalResultados: datos.length,
      lottoActivo: datos.filter((r: any) => r.lotteryType === 'lotto-activo').length,
      guacharoActivo: datos.filter((r: any) => r.lotteryType === 'guacharo-activo').length,
      ultimaActualizacion: localStorage.getItem('last-historical-update') || 'Nunca'
    };
  }
}

export default new LoteriaDehoyService();