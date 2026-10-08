import React, { useState, useEffect, createContext, useContext } from 'react';
import './App.css';
import TokenForm from './components/TokenForm';
import Features from './components/Features';
import FAQ from './components/FAQ';
import TokenReport from './components/TokenReport';
import { translations } from './translations';
import FadeInSection from './components/FadeInSection';
import { LanguageContext } from './contexts/LanguageContext';
import solanaLogo from './assets/images/solana-logo.png';
import bscLogo from './assets/images/bsc-logo.png';

const t = {
  en: {
    title: "Create your Solana token in one click",
    subtitle: "Simple, fast, efficient",
    title1: "CREATE YOUR",
    title2: "SOLANA TOKEN",
    intro: "The easiest way to create your token on Solana.",
    tagline: "Because you're lazy 😴",
    lazyText: "it's that simple",
    buttons: {
      connect: "Connect Phantom",
      install: "Install Phantom",
      disconnect: "Disconnect",
      create: "✨ Create new token"
    },
    disclaimer: {
      part1: "LazyCoin is a token creation platform that allows users to generate Solana tokens instantly, with no code required. LazyCoin does not issue, endorse, manage, or provide liquidity for tokens created through our service. We do not provide financial advice, investment recommendations, or guarantees of value, price, or returns on tokens.",
      part2: "Tokens created on LazyCoin are not securities, and users are solely responsible for complying with applicable laws and regulations in their jurisdiction. LazyCoin does not facilitate token trading, fundraising, or liquidity provision. By using LazyCoin, you acknowledge that creating and trading tokens involves significant risks, including loss of funds, market volatility, and regulatory uncertainty.",
      part3: "LazyCoin is provided 'as is' without warranty of any kind. We are not responsible for results related to the use of our platform. By using LazyCoin, you accept full responsibility for your actions and any consequences that may result. Always do your own research before engaging with any token or project."
    }
  },
  fr: {
    title: "Créez votre token Solana en un clic",
    subtitle: "Simple, rapide, efficace",
    title1: "CRÉEZ VOTRE",
    title2: "TOKEN SOLANA",
    intro: "La façon la plus simple de créer votre token sur Solana.",
    tagline: "Parce que vous êtes lazy 😴",
    lazyText: "c'est aussi simple que ça",
    buttons: {
      connect: "Connecter Phantom",
      install: "Installer Phantom",
      disconnect: "Déconnecter",
      create: "✨ Créer un nouveau token"
    },
    disclaimer: {
      part1: "LazyCoin est une plateforme de création de tokens permettant aux utilisateurs de générer des tokens Solana instantanément, sans code requis. LazyCoin n'émet pas, n'approuve pas, ne gère pas et ne fournit pas de liquidité pour les tokens créés via notre service. Nous ne fournissons pas de conseils financiers, de recommandations d'investissement ou de garanties de valeur, de prix ou de rendement sur les tokens.",
      part2: "Les tokens créés sur LazyCoin ne sont pas des titres, et les utilisateurs sont seuls responsables du respect des lois et réglementations applicables dans leur juridiction. LazyCoin ne facilite pas le trading de tokens, la levée de fonds ou la fourniture de liquidité. En utilisant LazyCoin, vous reconnaissez que la création et le trading de tokens comportent des risques importants, notamment de perte de fonds, de volatilité du marché et d'incertitude réglementaire.",
      part3: "LazyCoin est fourni \"tel quel\" sans garantie d'aucune sorte. Nous ne sommes pas responsables des résultats liés à l'utilisation de notre plateforme. En utilisant LazyCoin, vous acceptez l'entière responsabilité de vos actions et de toutes les conséquences qui peuvent en découler. Effectuez toujours vos propres recherches avant de vous engager avec un token ou un projet."
    }
  }
};

function App() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [hasPhantom, setHasPhantom] = useState(false);
  const [network, setNetwork] = useState('devnet');
  const [publicKey, setPublicKey] = useState('');
  const [showNotification, setShowNotification] = useState(false);
  const [tokenMetadata, setTokenMetadata] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [language, setLanguage] = useState(() => {
    const savedLanguage = localStorage.getItem('language');
    return savedLanguage || 'fr';
  });
  const [blockchain, setBlockchain] = useState('SOL');
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  useEffect(() => {
    const checkPhantom = async () => {
      try {
        const isPhantomInstalled = window?.solana?.isPhantom || false;
        console.log('Phantom installé:', isPhantomInstalled);
        setHasPhantom(isPhantomInstalled);
        
        if (isPhantomInstalled) {
          window.solana.on('connect', (response) => {
            console.log('Connecté avec:', response.publicKey.toString());
            setWalletConnected(true);
            setPublicKey(response.publicKey.toString());
          });
          
          window.solana.on('disconnect', () => {
            setWalletConnected(false);
            setPublicKey('');
          });
          
          try {
            const response = await window.solana.connect({ onlyIfTrusted: true });
            console.log('Reconnecté avec:', response.publicKey.toString());
            setWalletConnected(true);
            setPublicKey(response.publicKey.toString());
          } catch (err) {
            console.log("Pas de reconnexion automatique");
          }
        }
      } catch (error) {
        console.error("Erreur lors de la vérification de Phantom:", error);
      }
    };

    checkPhantom();

    return () => {
      window.solana?.removeAllListeners('connect');
      window.solana?.removeAllListeners('disconnect');
    };
  }, []);

  useEffect(() => {
    const controlHeader = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY < lastScrollY || currentScrollY < 50) {
        setIsHeaderVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setIsHeaderVisible(false);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', controlHeader);
    
    return () => {
      window.removeEventListener('scroll', controlHeader);
    };
  }, [lastScrollY]);

  const connectWallet = async () => {
    try {
      if (!window.solana) {
        alert("Phantom n'est pas installé!");
        window.open('https://phantom.app/', '_blank');
        return;
      }

      const response = await window.solana.connect();
      console.log('Connecté avec:', response.publicKey.toString());
      setWalletConnected(true);
      setPublicKey(response.publicKey.toString());
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
    } catch (error) {
      console.error("Erreur de connexion:", error);
      alert("Erreur lors de la connexion à Phantom");
    }
  };

  const disconnectWallet = async () => {
    try {
      const { solana } = window;
      if (solana) {
        await solana.disconnect();
        setWalletConnected(false);
      }
    } catch (error) {
      console.error("Erreur de déconnexion:", error);
    }
  };

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const toggleNetwork = () => {
    setNetwork(network === 'devnet' ? 'mainnet' : 'devnet');
  };

  const handleTokenCreated = (metadata) => {
    console.log("Métadonnées reçues:", metadata);
    setTokenMetadata(metadata);
    setShowReport(true);
  };

  const handleReset = () => {
    setTokenMetadata(null);
  };

  const handleBlockchainSwitch = (chain) => {
    if (chain === 'BSC') {
      setShowComingSoon(true);
      setTimeout(() => setShowComingSoon(false), 2000);
    } else {
      setBlockchain(chain);
    }
  };

  const handleTokenCreation = async (formData) => {
    try {
      setIsLoading(true);
      setProgress(0);
      setStatus('');
      
      // Construire l'URL avec les paramètres
      const params = new URLSearchParams({
        mode: 'create',
        language: language,
        // ... autres paramètres ...
      });
      
      // Si c'est une reprise de recherche, ajouter le paramètre retry
      if (formData.retry) {
        params.append('retry', 'true');
        // Commencer avec une progression de 60% pour les reprises
        setProgress(60);
      }
      
      const url = `http://localhost:3001/api/token?${params.toString()}`;
      
      // Créer une connexion SSE
      const eventSource = new EventSource(url);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Message SSE reçu:', data);
          
          if (data.type === 'progress') {
            setStatus(data.message);
            
            // Important : forcer la mise à jour de la progression
            // même si elle est inférieure à la progression actuelle
            if (data.progress !== undefined) {
              console.log(`Mise à jour de la progression: ${data.progress}%`);
              setProgress(data.progress);
            }
          }
          
          // ... reste du code ...
        } catch (error) {
          console.error('Erreur parsing SSE:', error);
        }
      };
      
      // ... reste du code ...
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <div className="App">
        {showNotification && (
          <div className="connection-notification">
            Portefeuille connecté avec succès ✓
          </div>
        )}
        
        <header className={`top-nav ${isHeaderVisible ? 'visible' : 'hidden'}`}>
          <div className="nav-content">
            <div className="nav-left">
              <a href="/" className="logo">
                <span className="logo-text">LazyCoin</span>
              </a>
              <div className="nav-left-divider"></div>
              <div className="language-switch">
                <button 
                  className={`language-button ${language === 'en' ? 'active' : ''}`}
                  onClick={() => setLanguage('en')}
                >
                  EN
                </button>
                <button 
                  className={`language-button ${language === 'fr' ? 'active' : ''}`}
                  onClick={() => setLanguage('fr')}
                >
                  FR
                </button>
              </div>
              <div className="nav-left-divider"></div>
              <div className="blockchain-switch">
                <button 
                  className={`blockchain-button ${blockchain === 'SOL' ? 'active' : ''}`}
                  onClick={() => handleBlockchainSwitch('SOL')}
                  data-chain="SOL"
                >
                  <img 
                    src={solanaLogo}
                    alt="Solana" 
                    className="blockchain-logo"
                  />
                  SOL
                </button>
                <button 
                  className={`blockchain-button ${blockchain === 'BSC' ? 'active' : ''}`}
                  onClick={() => handleBlockchainSwitch('BSC')}
                  data-chain="BSC"
                >
                  <img 
                    src={bscLogo}
                    alt="BSC" 
                    className="blockchain-logo"
                  />
                  BSC
                </button>
              </div>
              
              {walletConnected && (
                <>
                  <div className="nav-left-divider"></div>
                  <div className="network-switch">
                    <button
                      className={`network-button ${network === 'devnet' ? 'active' : ''}`}
                      onClick={() => setNetwork('devnet')}
                    >
                      Devnet
                    </button>
                    <button
                      className={`network-button ${network === 'mainnet' ? 'active' : ''}`}
                      onClick={() => setNetwork('mainnet')}
                    >
                      Mainnet
                    </button>
                  </div>
                </>
              )}
            </div>
            
            <div className="nav-right">
              {walletConnected ? (
                <div className="wallet-info">
                  <span className="wallet-address">
                    {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
                  </span>
                </div>
              ) : (
                <button 
                  onClick={connectWallet} 
                  className="connect-button-nav"
                >
                  {hasPhantom ? t[language].buttons.connect : t[language].buttons.install} 👻
                </button>
              )}
            </div>
          </div>
        </header>

        {showComingSoon && (
          <div className="coming-soon-notification">
            {language === 'fr' ? 'Bientôt disponible' : 'Coming soon'}
          </div>
        )}

        {walletConnected ? (
          <div className="connected-layout">
            {tokenMetadata ? (
              <TokenReport 
                metadata={tokenMetadata} 
                onReset={handleReset}
              />
            ) : (
              <>
                <div className="connected-header">
                  <h1 className="main-title">
                    <div className="title-container">
                      <div className="title-group">
                        <span className="title-line">{t[language].title}</span>
                        <div className="highlight-container">
                          <span className="title-highlight">{t[language].subtitle}</span>
                          <span className="title-emoji" role="img" aria-label="rocket">🚀</span>
                        </div>
                      </div>
                    </div>
                  </h1>
                  <p className="main-description">
                    <span className="lazy-highlight">{t[language].tagline}</span>
                  </p>
                </div>
                <TokenForm 
                  walletConnected={walletConnected}
                  network={network}
                  onTokenCreated={handleTokenCreated}
                />
                <div className="connected-content">
                  <Features isConnected={true} />
                  <FAQ />
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="hero-section">
              <h1 className="main-title">
                <div className="title-container">
                  <div className="title-group">
                    <span className="title-line">{t[language].title}</span>
                    <div className="highlight-container">
                      <span className="title-highlight">{t[language].subtitle}</span>
                      <span className="title-emoji" role="img" aria-label="rocket">🚀</span>
                    </div>
                  </div>
                </div>
              </h1>
              <p className="main-description">
                <span className="lazy-highlight">
                  {t[language].tagline}
                </span>
              </p>
              {!walletConnected && (
                <button 
                  onClick={connectWallet} 
                  className="connect-button-main"
                >
                  {hasPhantom ? t[language].buttons.connect : t[language].buttons.install} 👻
                </button>
              )}
            </div>
            <div className="disconnected-content">
              <Features isConnected={false} />
              <FAQ />
            </div>
          </>
        )}
        
        <FadeInSection>
          <footer className="app-footer">
            <div className="footer-content">
              <div className="disclaimer">
                <p className="disclaimer-text">{t[language].disclaimer.part1}</p>
                <p className="disclaimer-text">{t[language].disclaimer.part2}</p>
                <p className="disclaimer-text">{t[language].disclaimer.part3}</p>
              </div>
              <div className="footer-links">
                <div className="footer-social">
                  <a href="#" aria-label="Twitter">𝕏</a>
                  <a href="#" aria-label="Discord">Discord</a>
                </div>
              </div>
              <p className="copyright">© 2025 LazyCoin. Tous droits réservés.</p>
            </div>
          </footer>
        </FadeInSection>
      </div>
    </LanguageContext.Provider>
  );
}

export default App;
