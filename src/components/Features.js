import React, { useContext } from 'react';
import { LanguageContext } from '../contexts/LanguageContext';
import './Features.css';
import FadeInSection from './FadeInSection';

const Features = ({ isConnected }) => {
  const { language } = useContext(LanguageContext);

  const features = {
    en: [
      {
        icon: '⚡',
        title: 'Ultra Fast',
        description: 'Create your token in less than 30 seconds'
      },
      {
        icon: '🎯',
        title: 'Custom Address',
        description: 'Choose the first characters of your address'
      },
      {
        icon: '🔄',
        title: 'Copy Mode',
        description: 'Copy any existing token instantly'
      },
      {
        icon: '💎',
        title: 'Free Testing',
        description: 'Test for free on devnet'
      },
      {
        icon: '🔒',
        title: 'Full Control',
        description: 'Keep your mint authority private key - you have 100% control'
      },
      {
        icon: '🌈',
        title: 'Multi-Chain',
        description: 'Coming soon on Ethereum, BSC and Polygon'
      }
    ],
    fr: [
      {
        icon: '⚡',
        title: 'Ultra Rapide',
        description: 'Créez votre token en moins de 30 secondes'
      },
      {
        icon: '🎯',
        title: 'Adresse Personnalisée',
        description: 'Choisissez les premiers caractères de votre adresse'
      },
      {
        icon: '🔄',
        title: 'Mode Copie',
        description: 'Copiez n\'importe quel token instantanément'
      },
      {
        icon: '💎',
        title: 'Test Gratuit',
        description: 'Testez gratuitement sur le devnet'
      },
      {
        icon: '🔒',
        title: 'Contrôle Total',
        description: 'Gardez votre clé privée de mint - vous avez 100% le contrôle'
      },
      {
        icon: '🌈',
        title: 'Multi-Chaîne',
        description: 'Bientôt sur Ethereum, BSC et Polygon'
      }
    ]
  };

  const currentFeatures = features[language];

  return (
    <div className="features-section">
      <FadeInSection>
        <h2>{language === 'en' ? 'Why Choose LazyCoin?' : 'Pourquoi Choisir LazyCoin ?'}</h2>
      </FadeInSection>
      <div className="features-grid">
        {currentFeatures.map((feature, index) => (
          <FadeInSection key={index} style={{ transitionDelay: `${index * 0.1}s` }}>
            <div className="feature-card">
              <div className="feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          </FadeInSection>
        ))}
      </div>
    </div>
  );
};

export default Features; 