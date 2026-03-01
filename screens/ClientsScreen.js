import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ClientList from '../components/ClientList';
import ClientDetailsScreen from './ClientDetailsScreen';
import OffcanvasSidebar from '../components/OffcanvasSidebar';
import BottomBar from '../components/BottomBar';
import TranslationModal from '../components/TranslationModal';
import { colors } from '../constants/theme';

// Mock data - replace with actual data source
const mockClients = [
  {
    id: 1,
    name: 'John Doe',
    username: 'johndoe',
    company: 'Tech Corp',
    country: 'USA',
    language: 'English',
    review_avg_rating: 4.8,
    review_count: 125,
    last_message_timestamp: '2024-01-15 10:30:00',
  },
  {
    id: 2,
    name: 'Jane Smith',
    username: 'janesmith',
    company: 'Design Studio',
    country: 'UK',
    language: 'English',
    review_avg_rating: 4.9,
    review_count: 89,
    last_message_timestamp: '2024-01-14 15:20:00',
  },
];

const mockMessages = {
  1: [
    { text: 'Hello, I need a website design', sender: 'client', time: '2024-01-15 10:00:00' },
    { text: 'Sure! I can help you with that. What kind of design are you looking for?', sender: 'me', time: '2024-01-15 10:05:00' },
  ],
  2: [
    { text: 'Hi, are you available for a new project?', sender: 'client', time: '2024-01-14 15:00:00' },
  ],
};

const ClientsScreen = () => {
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [clients] = useState(mockClients);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTranslationModalVisible, setIsTranslationModalVisible] = useState(false);
  const [translationInitialText, setTranslationInitialText] = useState('');

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const selectedMessages = selectedClientId ? (mockMessages[selectedClientId] || []) : [];

  const handleSelectClient = (clientId) => {
    setSelectedClientId(clientId);
    setIsSidebarOpen(false); // Close sidebar when client is selected
  };

  const handleDeleteClient = (clientId) => {
    // Handle delete logic
    console.log('Delete client:', clientId);
  };

  const handleMenuToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleOpenTranslationModal = (initialText = '') => {
    setTranslationInitialText(initialText);
    setIsTranslationModalVisible(true);
  };

  const handleTranslationTextReady = (translatedText) => {
    // Handle the translated text - you can use it to send a message, etc.
    console.log('Translated text ready:', translatedText);
    // You can integrate this with your message sending logic
  };

  const handleUseInputText = (inputText) => {
    // Handle using the input text (voice detected text)
    console.log('Input text ready:', inputText);
    // You can integrate this with your message input logic
  };

  return (
    <SafeAreaView edges={['top','bottom']} style={styles.container}>
      <View style={styles.content}>
        {/* Offcanvas Sidebar */}
        <OffcanvasSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        >
          <ClientList
            clients={clients}
            selectedClientId={selectedClientId}
            onSelectClient={handleSelectClient}
            onDeleteClient={handleDeleteClient}
          />
        </OffcanvasSidebar>

        {/* Main Content */}
        <View style={styles.details}>
          {selectedClient ? (
            <ClientDetailsScreen
              client={selectedClient}
              messages={selectedMessages}
              analysis={{}}
            />
          ) : (
            <LinearGradient
              colors={[colors.background.primary, colors.background.secondary]}
              style={styles.emptyState}
            >
              <View style={styles.emptyContent}>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyTitle}>Select a Client</Text>
                <Text style={styles.emptyText}>
                  Choose a client from the list to view their details, messages, and analysis.
                </Text>
              </View>
            </LinearGradient>
          )}
        </View>
      </View>

      {/* Bottom Bar with Menu Toggle */}
      <BottomBar
        onMenuToggle={handleMenuToggle}
        isMenuOpen={isSidebarOpen}
      />

      {/* Translation Modal */}
      <TranslationModal
        visible={isTranslationModalVisible}
        onClose={() => setIsTranslationModalVisible(false)}
        initialText={translationInitialText}
        targetLanguage={selectedClient?.language === 'English' ? 'en' : selectedClient?.language?.toLowerCase() || 'en'}
        onTextReady={handleTranslationTextReady}
        onUseInputText={handleUseInputText}
      />

      {/* Floating Translation Button */}
      <TouchableOpacity
        style={styles.translateFloatingButton}
        onPress={() => handleOpenTranslationModal()}
      >
        <Ionicons name="language" size={24} color={colors.text.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    flex: 1,
  },
  details: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyContent: {
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#a0a0a0',
    textAlign: 'center',
    lineHeight: 24,
  },
  translateFloatingButton: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default ClientsScreen;
