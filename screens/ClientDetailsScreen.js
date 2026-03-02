import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import TabButton from '../components/TabButton';
import TranslationModal from '../components/TranslationModal';
import AIChatTab from '../components/AIChatTab';
import MessagesTab from '../components/MessagesTab';
import { useWebSocket } from '../context/WebSocketContext';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

const ClientDetailsScreen = ({ client, messages = [], onFetchMessages, onSendMessage }) => {
  const { isConnected, fetchClientDetails, clientData } = useWebSocket();
  const [activeTab, setActiveTab] = useState('messages');
  const [messageText, setMessageText] = useState('');
  const [isTranslationModalVisible, setIsTranslationModalVisible] = useState(false);
  const [isFetchingMessages, setIsFetchingMessages] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const fetchTimeoutRef = useRef(null);

  // Merge fetched client data with client prop
  const mergedClient = React.useMemo(() => {
    if (!client) return null;
    
    const conversationId = client.conversationId || client.username || client.id;
    const key = client.username || conversationId;
    const fetchedData = clientData[key];
    
    if (fetchedData) {
      // Merge fetched data with existing client data, prioritizing fetched data
      return {
        ...client,
        ...fetchedData,
        // Preserve some original values if fetched data doesn't have them
        name: fetchedData.name || client.name,
        username: fetchedData.username || client.username,
        email: fetchedData.email || client.email,
        company: fetchedData.company || client.company,
        project_name: fetchedData.project_name || client.project_name,
        status: fetchedData.status || client.status,
        budget: fetchedData.budget || client.budget,
        country: fetchedData.country || client.country,
        language: fetchedData.language || client.language,
        review_avg_rating: fetchedData.review_avg_rating !== undefined ? fetchedData.review_avg_rating : client.review_avg_rating,
        review_count: fetchedData.review_count !== undefined ? fetchedData.review_count : client.review_count,
        avatar_url: fetchedData.avatar_url || fetchedData.avatarUrl || client.avatar_url,
      };
    }
    
    return client;
  }, [client, clientData]);

  const renderHeader = () => {
    const displayClient = mergedClient || client;
    
    return (
      <LinearGradient
        colors={[colors.background.card, colors.background.cardLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {displayClient?.name ? displayClient.name.substring(0, 2).toUpperCase() : '?'}
              </Text>
            </View>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.clientName}>{displayClient?.name || 'Unknown Client'}</Text>
            {displayClient?.username && (
              <Text style={styles.clientUsername}>@{displayClient.username}</Text>
            )}
            <View style={styles.infoRow}>
              {displayClient?.country && (
                <View style={styles.infoBadge}>
                  <Text style={styles.infoIcon}>🌍</Text>
                  <Text style={styles.infoText}>{displayClient.country}</Text>
                </View>
              )}

              {displayClient?.language && (
                <View style={styles.infoBadge}>
                  <Text style={styles.infoIcon}>🗣️</Text>
                  <Text style={styles.infoText}>{displayClient.language}</Text>
                </View>
              )}

              {displayClient?.review_avg_rating && (
                <View style={styles.infoBadge}>
                  <Text style={styles.infoIcon}>⭐</Text>
                  <Text style={styles.infoText}>{parseFloat(displayClient.review_avg_rating).toFixed(1)}</Text>
                </View>
              )}
              {displayClient?.review_count && (
                <View style={styles.infoBadge}>
                  <Text style={styles.infoIcon}>📝</Text>
                  <Text style={styles.infoText}>{displayClient.review_count} reviews</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </LinearGradient>
    );
  };

  const renderTabs = () => (
    <View style={styles.tabsContainer}>
      <TabButton
        label="Messages"
        icon="💬"
        isActive={activeTab === 'messages'}
        onPress={() => setActiveTab('messages')}
      />
      <TabButton
        label="AI Chat"
        icon="💡"
        isActive={activeTab === 'aichat'}
        onPress={() => setActiveTab('aichat')}
      />
      <TabButton
        label="Info"
        icon="ℹ️"
        isActive={activeTab === 'info'}
        onPress={() => setActiveTab('info')}
      />
    </View>
  );

  const handleSendMessage = () => {
    if (!messageText.trim()) {
      return;
    }
    
    const conversationId = client?.conversationId || client?.username || client?.id;
    if (!conversationId) {
      console.warn('[ClientDetailsScreen] Cannot send message: no conversation ID');
      return;
    }
    
    if (onSendMessage) {
      const success = onSendMessage(messageText, conversationId);
      if (success) {
        // Clear the input after sending
        setMessageText('');
      }
    }
  };

  const handleFetchMessages = () => {
    if (onFetchMessages) {
      setIsFetchingMessages(true);
      onFetchMessages();
      // Reset loading state after a delay (messages will update when received)
      setTimeout(() => {
        setIsFetchingMessages(false);
      }, 5000);
    }
  };

  // Reset fetching state when messages are received
  useEffect(() => {
    if (messages.length > 0 && isFetchingMessages) {
      setIsFetchingMessages(false);
    }
  }, [messages.length, isFetchingMessages]);

  // Reset fetching details state when client data is received
  useEffect(() => {
    if (isFetchingDetails && client) {
      const conversationId = client.conversationId || client.username || client.id;
      const key = client.username || conversationId;
      if (clientData[key]) {
        // Clear timeout if data is received
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current);
          fetchTimeoutRef.current = null;
        }
        setIsFetchingDetails(false);
        Alert.alert(
          'Success',
          `Client details for ${client.name || client.username} have been successfully fetched and saved!`,
          [{ text: 'OK' }]
        );
      }
    }
  }, [clientData, client, isFetchingDetails]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  const handleFetchDetails = () => {
    if (!client) {
      Alert.alert('Error', 'No client selected');
      return;
    }

    const username = client.username;
    if (!username) {
      Alert.alert('Error', 'This client does not have a username. Cannot fetch details.');
      return;
    }

    if (!isConnected) {
      Alert.alert('Not Connected', 'Please wait for connection to server.');
      return;
    }

    // Clear any existing timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }

    setIsFetchingDetails(true);
    
    // Handle error callback
    const handleError = (errorMessage) => {
      setIsFetchingDetails(false);
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
      Alert.alert('Error', errorMessage || 'Failed to fetch client details. Please try again.');
    };
    
    const success = fetchClientDetails(username, handleError);
    
    if (!success) {
      setIsFetchingDetails(false);
      Alert.alert('Error', 'Failed to send fetch request. Please try again.');
      return;
    }

    // Set timeout in case the fetch takes too long or fails
    fetchTimeoutRef.current = setTimeout(() => {
      setIsFetchingDetails(false);
      fetchTimeoutRef.current = null;
      Alert.alert(
        'Timeout',
        'Fetching client details is taking longer than expected. Please check if the browser extension is connected and try again.',
        [{ text: 'OK' }]
      );
    }, 30000); // 30 second timeout
  };

  const renderMessagesTab = () => (
    <MessagesTab
      messages={messages}
      messageText={messageText}
      setMessageText={setMessageText}
      onOpenTranslationModal={() => setIsTranslationModalVisible(true)}
      onSend={handleSendMessage}
      onFetchMessages={handleFetchMessages}
      isFetchingMessages={isFetchingMessages}
    />
  );

  const renderInfoTab = () => {
    const displayClient = mergedClient || client;
    
    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={styles.infoContent}>
        {/* Fetch Details Button */}
        <TouchableOpacity
          style={[styles.fetchButton, isFetchingDetails && styles.fetchButtonDisabled]}
          onPress={handleFetchDetails}
          disabled={isFetchingDetails || !isConnected}
        >
          {isFetchingDetails ? (
            <View style={styles.fetchButtonContent}>
              <ActivityIndicator size="small" color={colors.text.white} style={styles.fetchButtonLoader} />
              <Text style={styles.fetchButtonText}>Fetching Details...</Text>
            </View>
          ) : (
            <View style={styles.fetchButtonContent}>
              <Ionicons name="refresh" size={20} color={colors.text.white} style={styles.fetchButtonIcon} />
              <Text style={styles.fetchButtonText}>Fetch Details</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <InfoField label="Full Name" value={displayClient?.name} />
          <InfoField label="Username" value={displayClient?.username} />
          <InfoField label="Email" value={displayClient?.email} />
          <InfoField label="Company" value={displayClient?.company} />
          <InfoField label="Country" value={displayClient?.country} />
          <InfoField label="Language" value={displayClient?.language} />
        </View>
        <View style={styles.infoCard}>
          <InfoField label="Project Name" value={displayClient?.project_name} />
          <InfoField label="Status" value={displayClient?.status} />
          <InfoField label="Budget" value={displayClient?.budget} />
          <InfoField label="Rating" value={displayClient?.review_avg_rating ? `${parseFloat(displayClient.review_avg_rating).toFixed(1)} ⭐` : null} />
          <InfoField label="Review Count" value={displayClient?.review_count ? `${displayClient.review_count} reviews` : null} />
          {displayClient?.url && (
            <InfoField label="Profile URL" value={displayClient.url} />
          )}
          {displayClient?.title && (
            <InfoField label="Title" value={displayClient.title} />
          )}
        </View>
      </ScrollView>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'messages':
        return renderMessagesTab();
      case 'aichat':
        return <AIChatTab client={client} messages={messages} onSendMessage={onSendMessage} isActive={activeTab === 'aichat'} />;
      case 'info':
        return renderInfoTab();
      default:
        return renderMessagesTab();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[colors.background.primary, colors.background.secondary]}
        style={styles.gradient}
      >
        {renderHeader()}
        {renderTabs()}
        <View style={styles.tabPane}>
          {renderTabContent()}
        </View>
      </LinearGradient>

      {/* Translation Modal */}
      <TranslationModal
        visible={isTranslationModalVisible}
        onClose={() => setIsTranslationModalVisible(false)}
        initialText={messageText}
        targetLanguage={
          (mergedClient || client)?.language === 'English'
            ? 'en'
            : (mergedClient || client)?.language?.toLowerCase() || 'en'
        }
        onTextReady={(translatedText) => {
          setMessageText(translatedText);
          setIsTranslationModalVisible(false);
        }}
        onUseInputText={(inputText) => {
          setMessageText(inputText);
          setIsTranslationModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
};

const InfoField = ({ label, value }) => {
  if (!value) return null;
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  header: {
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.bold,
    color: colors.text.white,
  },
  headerText: {
    flex: 1,
  },
  clientName: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  clientUsername: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  infoIcon: {
    fontSize: typography.sizes.sm,
    marginRight: spacing.xs / 2,
  },
  infoText: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    fontWeight: typography.weights.medium,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  tabPane: {
    flex: 1,
    backgroundColor: colors.background.card,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    marginTop: -1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl * 2,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semibold,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.sizes.base,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 24,
  },
  infoContent: {
    padding: spacing.lg,
  },
  infoCard: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  infoField: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  infoLabel: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing.xs,
  },
  infoValue: {
    fontSize: typography.sizes.lg,
    color: colors.text.primary,
    fontWeight: typography.weights.semibold,
  },
  fetchButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fetchButtonDisabled: {
    opacity: 0.6,
  },
  fetchButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fetchButtonIcon: {
    marginRight: spacing.sm,
  },
  fetchButtonLoader: {
    marginRight: spacing.sm,
  },
  fetchButtonText: {
    color: colors.text.white,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
  },
});

export default ClientDetailsScreen;
