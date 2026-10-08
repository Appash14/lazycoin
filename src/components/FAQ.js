import React, { useState } from 'react';
import { useContext } from 'react';
import { LanguageContext } from '../contexts/LanguageContext';
import './FAQ.css';

const FAQ = () => {
  const [openQuestion, setOpenQuestion] = useState(null);
  const { translations: t } = useContext(LanguageContext);

  const questions = {
    en: [
      {
        question: "What is Solana, and why launch my token on it?",
        answer: "Solana is an ultra-fast blockchain with minimal fees, perfect for tokens. Its technology enables instant and cost-effective transactions."
      },
      {
        question: "How to create a token on Solana?",
        answer: "With LazyCoin, create your token in just a few clicks. Connect your wallet, fill in the basic information, and launch your token on devnet for free."
      },
      {
        question: "What are the steps to deploy my token?",
        answer: "1. Connect your Phantom wallet 2. Choose between creating or copying a token 3. Fill in the details 4. Test on devnet 5. Deploy to mainnet when ready."
      },
      {
        question: "How to customize my token address?",
        answer: "Our service allows you to get a token address containing the first letters of your project name, making your token easily recognizable and more professional."
      }
    ],
    fr: [
      {
        question: "Qu'est-ce que Solana, et pourquoi y lancer mon token ?",
        answer: "Solana est une blockchain ultra-rapide avec des frais minimes, idéale pour les tokens. Sa technologie permet des transactions instantanées et économiques."
      },
      {
        question: "Comment créer un token sur Solana ?",
        answer: "Avec LazyCoin, créez votre token en quelques clics. Connectez votre wallet, remplissez les informations de base, et lancez votre token sur le devnet gratuitement."
      },
      {
        question: "Quelles sont les étapes pour déployer mon token ?",
        answer: "1. Connectez votre wallet Phantom 2. Choisissez entre créer ou copier un token 3. Remplissez les détails 4. Testez sur le devnet 5. Déployez sur le mainnet quand vous êtes prêt."
      },
      {
        question: "Comment personnaliser l'adresse de mon token ?",
        answer: "Notre service vous permet d'obtenir une adresse de token contenant les premières lettres du nom de votre projet, rendant votre token facilement reconnaissable et plus professionnel."
      }
    ]
  };

  const toggleQuestion = (index) => {
    setOpenQuestion(openQuestion === index ? null : index);
  };

  const { language } = useContext(LanguageContext);
  const currentQuestions = questions[language];

  return (
    <div className="faq-section">
      <h2>{language === 'en' ? 'Frequently Asked Questions' : 'Questions Fréquentes'}</h2>
      <div className="faq-list">
        {currentQuestions.map((item, index) => (
          <div 
            key={index} 
            className={`faq-item ${openQuestion === index ? 'open' : ''}`}
            onClick={() => toggleQuestion(index)}
          >
            <div className="faq-question">
              <h3>{item.question}</h3>
              <span className="faq-icon">{openQuestion === index ? '−' : '+'}</span>
            </div>
            <div className="faq-answer">
              <p>{item.answer}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FAQ; 