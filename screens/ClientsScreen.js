import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Dimensions, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useWebSocket } from '../context/WebSocketContext';
import ClientList from '../components/ClientList';
import ClientDetailsScreen from './ClientDetailsScreen';
import OffcanvasSidebar from '../components/OffcanvasSidebar';
import BottomBar from '../components/BottomBar';
import TranslationModal from '../components/TranslationModal';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

const ClientsScreen = ({ onNavigateToSettings }) => {
  const {
    isConnected,
    connectionStatus,
    clients,
    messages,
    clientData,
    newClientData,
    setNewClientData,
    selectedConversationId,
    setSelectedConversationId,
    requestAllData,
    requestClientList,
    requestMessages,
    requestClientData,
    triggerClientListExtraction,
    triggerMessageExtraction,
    clickClientInFiverr,
    sendMessageToClient,
  } = useWebSocket();

  const [selectedClientId, setSelectedClientId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTranslationModalVisible, setIsTranslationModalVisible] = useState(false);
  const [translationInitialText, setTranslationInitialText] = useState('');
  const [isRefetching, setIsRefetching] = useState(false);
  const [isNewClientModalVisible, setIsNewClientModalVisible] = useState(false);

  // Request data when connected
  useEffect(() => {
    if (isConnected) {
      console.log('[ClientsScreen] Connected, requesting data...');
      requestAllData();
    }
  }, [isConnected, requestAllData]);

  // Reset refetching state when clients are updated
  useEffect(() => {
    if (clients.length > 0 && isRefetching) {
      // Small delay to show the update
      const timer = setTimeout(() => {
        setIsRefetching(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [clients, isRefetching]);

  // Show modal when new client data is received
  useEffect(() => {
    if (newClientData) {
      setIsNewClientModalVisible(true);
    }
  }, [newClientData]);

  const handleAddNewClient = () => {
    if (newClientData) {
      // Add the new client to the clients list
      const newClient = {
        id: newClientData.username || newClientData.conversationId || Date.now(),
        name: newClientData.name || newClientData.username || 'Unknown',
        username: newClientData.username,
        country: newClientData.country || '',
        language: newClientData.language || '',
        review_avg_rating: newClientData.review_avg_rating || 0,
        review_count: newClientData.review_count || 0,
        conversationId: newClientData.conversationId || newClientData.username,
        avatar_url: newClientData.avatar_url || newClientData.avatarUrl || '',
        ...newClientData,
      };
      
      // The client will be added via the WebSocketContext when we trigger client list extraction
      // For now, we'll just close the modal and clear the new client data
      setNewClientData(null);
      setIsNewClientModalVisible(false);
      
      // Optionally trigger client list extraction to refresh the list
      if (isConnected) {
        triggerClientListExtraction();
      }
      
      Alert.alert('Client Added', `Client ${newClientData.name || newClientData.username} has been added to your list.`);
    }
  };

  const handleDismissNewClient = () => {
    setNewClientData(null);
    setIsNewClientModalVisible(false);
  };

  // Find selected client
  const selectedClient = clients.find((c) => {
    if (selectedClientId) {
      return c.id === selectedClientId || c.conversationId === selectedClientId || c.username === selectedClientId;
    }
    return false;
  });

  // Get messages for selected client
  const selectedMessages = React.useMemo(() => {
    if (!selectedClient) return [];
    
    const conversationId = selectedClient.conversationId || selectedClient.username || selectedClient.id;
    return messages[conversationId] || [];
  }, [selectedClient, messages]);

  const handleSelectClient = (clientId) => {
    setSelectedClientId(clientId);
    setIsSidebarOpen(false); // Close sidebar when client is selected
    
    // Request client data and messages for selected client
    const client = clients.find((c) => c.id === clientId || c.conversationId === clientId || c.username === clientId);
    if (client) {
      const conversationId = client.conversationId || client.username || client.id;
      const username = client.username;
      
      setSelectedConversationId(conversationId);
      
      // Trigger browser extension to click/activate this client in Fiverr
      if (username && isConnected) {
        console.log('[ClientsScreen] Activating client in browser:', username);
        clickClientInFiverr(username);
      }
      
      // Request specific client data and messages
      requestClientData(conversationId);
      requestMessages();
      
      // Also trigger message extraction for this specific client
      triggerMessageExtraction();
    }
  };

  const handleDeleteClient = (clientId) => {
    // Handle delete logic
    Alert.alert(
      'Delete Client',
      'Are you sure you want to remove this client?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            console.log('Delete client:', clientId);
            // TODO: Implement actual delete logic
          },
        },
      ]
    );
  };

  const handleRefetch = () => {
    // Handle refetch logic - trigger browser extension to fetch fresh data
    console.log('[ClientsScreen] Refetching clients and messages...');
    if (isConnected) {
      setIsRefetching(true);
      
      // Trigger browser extension to extract client list from Fiverr
      triggerClientListExtraction();
      
      // Trigger browser extension to extract messages from Fiverr
      triggerMessageExtraction();
      
      // Request stored data as fallback
      requestClientList();
      requestMessages();
      
      // Request messages for all clients
      if (clients.length > 0) {
        console.log('[ClientsScreen] Requesting messages for all clients...');
        clients.forEach((client) => {
          const conversationId = client.conversationId || client.username || client.id;
          if (conversationId) {
            requestClientData(conversationId);
          }
        });
      }
      
      // If a client is selected, also ensure their messages are requested
      if (selectedClient) {
        const conversationId = selectedClient.conversationId || selectedClient.username || selectedClient.id;
        if (conversationId) {
          requestClientData(conversationId);
          console.log('[ClientsScreen] Requesting messages for selected client:', conversationId);
        }
      }
      
      // Reset loading state after a delay (increased to allow messages to be fetched)
      setTimeout(() => {
        setIsRefetching(false);
        console.log('[ClientsScreen] Refetch complete. Messages should be displayed in UI.');
      }, 4000);
    } else {
      Alert.alert('Not Connected', 'Please wait for connection to server.');
    }
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

  // Connection status indicator
  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return colors.accent.success || '#4CAF50';
      case 'connecting':
        return colors.accent.warning || '#FF9800';
      case 'error':
      case 'disconnected':
        return colors.accent.error || '#F44336';
      default:
        return colors.text.secondary;
    }
  };

  return (
    <View style={styles.container}>
      {/* Connection Status Bar */}
      <View style={[styles.connectionBar, { backgroundColor: getConnectionStatusColor() }]}>
        <Text style={styles.connectionText}>
          {connectionStatus === 'connected' && 'Connected'}
          {connectionStatus === 'connecting' && 'Connecting...'}
          {connectionStatus === 'disconnected' && 'Disconnected'}
          {connectionStatus === 'error' && 'Connection Error'}
        </Text>
      </View>

      <View style={styles.content}>
        {/* Offcanvas Sidebar */}
        <OffcanvasSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onRefetch={handleRefetch}
          isRefetching={isRefetching}
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
              onFetchMessages={requestMessages}
              onSendMessage={sendMessageToClient}
            />
          ) : (
            <LinearGradient
              colors={[colors.background.primary, colors.background.secondary]}
              style={styles.emptyState}
            >
              <View style={styles.emptyContent}>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyTitle}>
                  {clients.length === 0 ? 'No Clients' : 'Select a Client'}
                </Text>
                <Text style={styles.emptyText}>
                  {clients.length === 0
                    ? isConnected
                      ? 'No clients found. Make sure the browser extension is connected and fetch clients.'
                      : 'Waiting for connection to server...'
                    : 'Choose a client from the list to view their details, messages, and analysis.'}
                </Text>
                {!isConnected && (
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => {
                      // The WebSocket context will handle reconnection
                      requestAllData();
                    }}
                  >
                    <Text style={styles.retryButtonText}>Retry Connection</Text>
                  </TouchableOpacity>
                )}
              </View>
            </LinearGradient>
          )}
        </View>
      </View>

      {/* Bottom Bar with Menu Toggle */}
      <BottomBar
        onMenuToggle={handleMenuToggle}
        isMenuOpen={isSidebarOpen}
        onRefetch={handleRefetch}
        isRefetching={isRefetching}
        showRefetch={!!selectedClient}
        onNavigateToSettings={onNavigateToSettings}
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

      {/* New Client Modal */}
      <Modal
        visible={isNewClientModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleDismissNewClient}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient
              colors={[colors.background.card, colors.background.cardLight]}
              style={styles.modalGradient}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🆕 New Client Detected</Text>
                <TouchableOpacity onPress={handleDismissNewClient} style={styles.modalCloseButton}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>
              
              {newClientData && (
                <View style={styles.modalBody}>
                  <View style={styles.modalClientInfo}>
                    <Text style={styles.modalClientName}>{newClientData.name || 'Unknown Client'}</Text>
                    {newClientData.username && (
                      <Text style={styles.modalClientUsername}>@{newClientData.username}</Text>
                    )}
                  </View>
                  
                  {(newClientData.country || newClientData.language) && (
                    <View style={styles.modalBadges}>
                      {newClientData.country && (
                        <View style={styles.modalBadge}>
                          <Text style={styles.modalBadgeIcon}>🌍</Text>
                          <Text style={styles.modalBadgeText}>{newClientData.country}</Text>
                        </View>
                      )}
                      {newClientData.language && (
                        <View style={styles.modalBadge}>
                          <Text style={styles.modalBadgeIcon}>🗣️</Text>
                          <Text style={styles.modalBadgeText}>{newClientData.language}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  
                  <Text style={styles.modalMessage}>
                    This client was found but is not in your current client list. Would you like to add them?
                  </Text>
                </View>
              )}
              
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={handleDismissNewClient}
                >
                  <Text style={styles.modalButtonTextSecondary}>Dismiss</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleAddNewClient}
                >
                  <Text style={styles.modalButtonTextPrimary}>Add Client</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: colors.background.primary,
    paddingTop: 40,
  },
  connectionBar: {
    height: 16,
    paddingHorizontal: 16,
    alignItems: 'center',

  },
  connectionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  details: {
    flex: 1,
  },
  retryButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: colors.accent.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.text.white,
    fontSize: 16,
    fontWeight: '600',
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
