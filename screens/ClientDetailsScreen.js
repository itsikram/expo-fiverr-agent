import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import TabButton from '../components/TabButton';
import MessageBubble from '../components/MessageBubble';
import TranslationModal from '../components/TranslationModal';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

const ClientDetailsScreen = ({ client, messages = [], analysis = {} }) => {
  const [activeTab, setActiveTab] = useState('messages');
  const [messageText, setMessageText] = useState('');
  const [isTranslationModalVisible, setIsTranslationModalVisible] = useState(false);

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
        label="AI Analysis"
        icon="🤖"
        isActive={activeTab === 'analysis'}
        onPress={() => setActiveTab('analysis')}
      />
      <TabButton
        label="Information"
        icon="ℹ️"
        isActive={activeTab === 'info'}
        onPress={() => setActiveTab('info')}
      />
    </View>
  );

  const renderMessagesTab = () => (
    <View style={styles.tabContent}>
      <ScrollView
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No Messages Yet</Text>
            <Text style={styles.emptyText}>
              Click 'Fetch Messages' to retrieve messages for this client.
            </Text>
          </View>
        ) : (
          messages.map((message, index) => (
            <MessageBubble
              key={index}
              message={message}
              isFromMe={message.sender === 'me' || message.isFromMe}
            />
          ))
        )}
      </ScrollView>
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.refetchButton}>
          <Text style={styles.refetchText}>🔄</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.messageInput}
          placeholder="Type your message here..."
          placeholderTextColor={colors.text.secondary}
          value={messageText}
          onChangeText={setMessageText}
          multiline
        />
        <TouchableOpacity
          style={styles.translateButton}
          onPress={() => setIsTranslationModalVisible(true)}
        >
          <Text style={styles.translateText}>🌐</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sendButton}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAnalysisTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.analysisContent}>
      {!analysis || Object.keys(analysis).length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🤖</Text>
          <Text style={styles.emptyTitle}>No Analysis Available</Text>
          <Text style={styles.emptyText}>
            Analyze messages to see AI insights here.
          </Text>
          <TouchableOpacity style={styles.analyzeButton}>
            <Text style={styles.analyzeButtonText}>🔍 Analyze Messages with AI</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          {analysis.summary && (
            <View style={styles.analysisSection}>
              <Text style={styles.sectionTitle}>📊 Analysis Summary</Text>
              <Text style={styles.sectionContent}>{analysis.summary}</Text>
            </View>
          )}
          {analysis.task_understanding && (
            <View style={styles.analysisSection}>
              <Text style={styles.sectionTitle}>📋 AI Overview</Text>
              <Text style={styles.sectionContent}>{analysis.task_understanding}</Text>
            </View>
          )}
          {analysis.next_message && (
            <View style={[styles.analysisSection, styles.highlightSection]}>
              <Text style={styles.sectionTitle}>✉️ Next Message to Client</Text>
              <Text style={styles.sectionContent}>{analysis.next_message}</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
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
      case 'analysis':
        return renderAnalysisTab();
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
    padding: spacing.lg,
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
  tabContent: {
    flex: 1,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: spacing.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background.card,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    gap: spacing.sm,
  },
  refetchButton: {
    padding: spacing.sm,
    backgroundColor: colors.accent.success,
    borderRadius: borderRadius.md,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refetchText: {
    fontSize: typography.sizes.base,
  },
  messageInput: {
    flex: 1,
    backgroundColor: colors.background.card,
    borderWidth: 2,
    borderColor: colors.border.dark,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontSize: typography.sizes.base,
    maxHeight: 100,
  },
  translateButton: {
    padding: spacing.sm,
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translateText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  sendButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
  },
  sendText: {
    color: colors.text.white,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.bold,
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
  analyzeButton: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.accent.info,
    borderRadius: borderRadius.md,
  },
  analyzeButtonText: {
    color: colors.text.white,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
  },
  analysisContent: {
    padding: spacing.lg,
  },
  analysisSection: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.dark,
  },
  highlightSection: {
    backgroundColor: '#1e3a2e',
    borderColor: colors.accent.success,
    borderWidth: 2,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.accent.success,
    marginBottom: spacing.md,
  },
  sectionContent: {
    fontSize: typography.sizes.base,
    color: colors.text.primary,
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
