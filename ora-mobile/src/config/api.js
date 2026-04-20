// Troque pelo IP da sua máquina na rede local (não use localhost no dispositivo físico)
// Para descobrir: ifconfig | grep "inet " (Mac)
const API_BASE_URL = "http://192.168.15.185:3000";

// ID do usuário — futuramente virá de autenticação
const DEFAULT_USER_ID = "edgar";

export { API_BASE_URL, DEFAULT_USER_ID };
