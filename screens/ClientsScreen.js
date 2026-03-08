import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Dimensions, Modal, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useWebSocket } from '../context/WebSocketContext';
import ClientList from '../components/ClientList';
import ProfileSelector from '../components/ProfileSelector';
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
    sellerProfile,
    sellerProfiles,
    selectedSellerProfile,
    setSelectedSellerProfile,
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
    deleteClient,
  } = useWebSocket();

  const [selectedClientId, setSelectedClientId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTranslationModalVisible, setIsTranslationModalVisible] = useState(false);
  const [translationInitialText, setTranslationInitialText] = useState('');
  const [translationModalVoiceOnly, setTranslationModalVoiceOnly] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [isNewClientModalVisible, setIsNewClientModalVisible] = useState(false);
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(false);

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

  // Mark initial data as loaded after first client list is received
  useEffect(() => {
    if (clients.length > 0 && !hasInitialDataLoaded) {
      // Small delay to ensure initial fetch is complete
      const timer = setTimeout(() => {
        setHasInitialDataLoaded(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [clients.length, hasInitialDataLoaded]);

  // Show modal when new client data is received (only after initial data is loaded)
  // DISABLED: Modal is disabled for now
  // useEffect(() => {
  //   if (newClientData && hasInitialDataLoaded) {
  //     setIsNewClientModalVisible(true);
  //   }
  // }, [newClientData, hasInitialDataLoaded]);

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

  // Same flow as selecting a client: activate in browser, then extract after delay.
  const EXTRACTION_DELAY_MS = 2800;

  const handleFetchMessages = () => {
    if (!selectedClient || !isConnected) {
      if (selectedClient) requestMessages(selectedClient.conversationId || selectedClient.username || selectedClient.id);
      return;
    }
    const conversationId = selectedClient.conversationId || selectedClient.username || selectedClient.id;
    const username = selectedClient.username;
    requestMessages(conversationId);
    if (username) {
      clickClientInFiverr(username);
      setTimeout(() => {
        triggerMessageExtraction();
      }, EXTRACTION_DELAY_MS);
    } else {
      triggerMessageExtraction();
    }
  };

  const handleSelectClient = (clientId) => {
    setSelectedClientId(clientId);
    setIsSidebarOpen(false); // Close sidebar when client is selected
    
    // Request client data and messages for selected client
    const client = clients.find((c) => c.id === clientId || c.conversationId === clientId || c.username === clientId);
    if (client) {
      const conversationId = client.conversationId || client.username || client.id;
      const username = client.username;
      
      setSelectedConversationId(conversationId);
      
      // Request client data immediately
      requestClientData(conversationId);
      requestMessages(conversationId);

      // Trigger browser extension to click/activate this client in Fiverr first
      if (username && isConnected) {
        console.log('[ClientsScreen] Activating client in browser:', username);
        clickClientInFiverr(username);
        // Delay message extraction so Fiverr has time to switch to this conversation.
        setTimeout(() => {
          console.log('[ClientsScreen] Triggering message extraction for:', username);
          triggerMessageExtraction();
        }, EXTRACTION_DELAY_MS);
      } else {
        triggerMessageExtraction();
      }
    }
  };

  const handleDeleteClient = (clientId) => {
    // Find the client to show its name in the confirmation
    const clientToDelete = clients.find((c) => {
      return c.id === clientId || c.conversationId === clientId || c.username === clientId;
    });

    const clientName = clientToDelete?.name || clientToDelete?.username || 'this client';

    // Handle delete logic
    Alert.alert(
      'Delete Client',
      `Are you sure you want to remove ${clientName}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            console.log('[ClientsScreen] Deleting client:', clientId);
            
            // Delete the client using the context function
            const deleted = deleteClient(clientId);
            
            if (deleted) {
              // Clear selected client if it's the one being deleted
              if (selectedClientId === clientId) {
                setSelectedClientId(null);
              }
              
              Alert.alert('Success', 'Client has been removed.');
            } else {
              Alert.alert('Error', 'Failed to delete client. Please try again.');
            }
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
    setIsSidebarOpen((prev) => !prev);
  };

  const handleOpenTranslationModal = (initialText = '') => {
    setTranslationInitialText(initialText);
    setTranslationModalVoiceOnly(false);
    setIsTranslationModalVisible(true);
  };

  const handleOpenVoiceModal = () => {
    setTranslationInitialText('');
    setTranslationModalVoiceOnly(true);
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
    <View style={[styles.container, Platform.OS === 'web' && styles.containerWeb]}>
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
          onOpen={() => setIsSidebarOpen(true)}
          enableSwipeOpen
          onRefetch={handleRefetch}
          isRefetching={isRefetching}
        >
          <ClientList
            sellerProfiles={sellerProfiles}
            selectedSellerProfile={selectedSellerProfile}
            onSelectProfile={setSelectedSellerProfile}
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
              onFetchMessages={handleFetchMessages}
              onSendMessage={sendMessageToClient}
            />
          ) : (
            <LinearGradient
              colors={[colors.background.primary, colors.background.secondary]}
              style={styles.emptyState}
            >
              <View style={styles.emptyContent}>
                <ProfileSelector
                  sellerProfiles={sellerProfiles}
                  selectedSellerProfile={selectedSellerProfile}
                  onSelectProfile={setSelectedSellerProfile}
                  variant="card"
                />
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
        onOpenVoiceModal={handleOpenVoiceModal}
      />

      {/* Translation Modal */}
      <TranslationModal
        visible={isTranslationModalVisible}
        onClose={() => setIsTranslationModalVisible(false)}
        initialText={translationInitialText}
        targetLanguage={selectedClient?.language === 'English' ? 'en' : selectedClient?.language?.toLowerCase() || 'en'}
        onTextReady={handleTranslationTextReady}
        onUseInputText={handleUseInputText}
        voiceOnly={translationModalVoiceOnly}
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
  containerWeb: {
    paddingTop: 0,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    maxWidth: 400,
    borderRadius: borderRadius.xl || 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  modalGradient: {
    padding: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border?.dark || 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: typography.weights?.bold || '700',
    color: colors.text.primary,
  },
  modalCloseButton: {
    padding: 4,
    borderRadius: borderRadius.sm || 8,
  },
  modalBody: {
    padding: 20,
  },
  modalClientInfo: {
    marginBottom: 16,
  },
  modalClientName: {
    fontSize: 20,
    fontWeight: typography.weights?.bold || '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  modalClientUsername: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  modalBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  modalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary || 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.md || 12,
  },
  modalBadgeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  modalBadgeText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: typography.weights?.medium || '500',
  },
  modalMessage: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border?.dark || 'rgba(255, 255, 255, 0.1)',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md || 12,
    minWidth: 100,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: colors.accent.primary,
  },
  modalButtonSecondary: {
    backgroundColor: colors.background.secondary || 'rgba(255, 255, 255, 0.1)',
  },
  modalButtonTextPrimary: {
    color: colors.text.white || '#fff',
    fontSize: 14,
    fontWeight: typography.weights?.semibold || '600',
  },
  modalButtonTextSecondary: {
    color: colors.text.secondary,
    fontSize: 14,
    fontWeight: typography.weights?.medium || '500',
  },
});

export default ClientsScreen;
