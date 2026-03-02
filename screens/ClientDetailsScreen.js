import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import TabButton from '../components/TabButton';
import TranslationModal from '../components/TranslationModal';
import AIChatTab from '../components/AIChatTab';
import MessagesTab from '../components/MessagesTab';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

const ClientDetailsScreen = ({ client, messages = [], onFetchMessages, onSendMessage }) => {
  const [activeTab, setActiveTab] = useState('messages');
  const [messageText, setMessageText] = useState('');
  const [isTranslationModalVisible, setIsTranslationModalVisible] = useState(false);
  const [isFetchingMessages, setIsFetchingMessages] = useState(false);

  const renderHeader = () => (
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
              {client?.name ? client.name.substring(0, 2).toUpperCase() : '?'}
            </Text>
          </View>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.clientName}>{client?.name || 'Unknown Client'}</Text>
          <View style={styles.infoRow}>
            {client?.country && (
              <View style={styles.infoBadge}>
                <Text style={styles.infoIcon}>🌍</Text>
                <Text style={styles.infoText}>{client.country}</Text>
              </View>
            )}

            {client?.review_avg_rating && (
              <View style={styles.infoBadge}>
                <Text style={styles.infoIcon}>⭐</Text>
                <Text style={styles.infoText}>{parseFloat(client.review_avg_rating).toFixed(1)}</Text>
              </View>
            )}
            {client?.review_count && (
              <View style={styles.infoBadge}>
                <Text style={styles.infoIcon}>📝</Text>
                <Text style={styles.infoText}>{client.review_count} reviews</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </LinearGradient>
  );

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
        label="Information"
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

  const renderInfoTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.infoContent}>
      <View style={styles.infoCard}>
        <InfoField label="Full Name" value={client?.name} />
        <InfoField label="Username" value={client?.username} />
        <InfoField label="Email" value={client?.email} />
        <InfoField label="Company" value={client?.company} />
        <InfoField label="Country" value={client?.country} />
        <InfoField label="Language" value={client?.language} />
      </View>
      <View style={styles.infoCard}>
        <InfoField label="Project Name" value={client?.project_name} />
        <InfoField label="Status" value={client?.status} />
        <InfoField label="Budget" value={client?.budget} />
        <InfoField label="Rating" value={client?.review_avg_rating ? `${parseFloat(client.review_avg_rating).toFixed(1)} ⭐` : null} />
        <InfoField label="Review Count" value={client?.review_count ? `${client.review_count} reviews` : null} />
      </View>
    </ScrollView>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'messages':
        return renderMessagesTab();
      case 'aichat':
        return <AIChatTab client={client} messages={messages} onSendMessage={onSendMessage} />;
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
          client?.language === 'English'
            ? 'en'
            : client?.language?.toLowerCase() || 'en'
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
});

export default ClientDetailsScreen;
