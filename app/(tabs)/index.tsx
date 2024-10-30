import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

// Open database synchronously
const db = SQLite.openDatabase('songs.db');

export default function App() {
  const [songs, setSongs] = useState([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setupAudioMode();
    setupDatabase();
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  const setupAudioMode = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      setError('Failed to initialize audio system');
      console.error(error);
    }
  };

  const setupDatabase = () => {
    db.transaction(
      tx => {
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            filePath TEXT NOT NULL UNIQUE
          );`
        );
        tx.executeSql(
          "SELECT COUNT(*) as count FROM songs;",
          [],
          (_, { rows }) => {
            if (rows._array[0].count === 0) {
              insertSampleSongs(tx);
            }
          }
        );
      },
      error => {
        setError('Database setup failed');
        console.error(error);
      },
      fetchSongs
    );
  };

  const insertSampleSongs = (tx) => {
    const sampleSongs = [
      ["Song 1", "Artist 1", "song1.mp3"],
      ["Song 2", "Artist 2", "song2.mp3"],
      ["Song 3", "Artist 3", "song3.mp3"]
    ];

    sampleSongs.forEach(song => {
      tx.executeSql(
        "INSERT OR IGNORE INTO songs (title, artist, filePath) VALUES (?, ?, ?);",
        song,
        null,
        (_, error) => console.error('Error inserting song:', error)
      );
    });
  };

  const fetchSongs = () => {
    db.transaction(tx => {
      tx.executeSql(
        "SELECT * FROM songs;",
        [],
        (_, { rows }) => {
          setSongs(rows._array);
          setIsLoading(false);
        },
        (_, error) => {
          setError('Failed to fetch songs');
          console.error(error);
          setIsLoading(false);
        }
      );
    });
  };

  const playSong = async () => {
    try {
      const song = songs[currentSongIndex];
      if (!song) return;

      setIsLoading(true);

      if (sound) {
        await sound.unloadAsync();
      }

      const songPath = FileSystem.documentDirectory + song.filePath;
      const songExists = await FileSystem.getInfoAsync(songPath);
      
      if (!songExists.exists) {
        throw new Error(`Song file not found: ${song.filePath}`);
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: songPath },
        { shouldPlay: true }
      );

      setSound(newSound);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          nextSong();
        }
      });

    } catch (error) {
      setError(`Failed to play song: ${error.message}`);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayPause = async () => {
    try {
      if (!sound) {
        await playSong();
        return;
      }

      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
      setIsPlaying(!isPlaying);
    } catch (error) {
      setError('Failed to toggle playback');
      console.error(error);
    }
  };

  const nextSong = () => {
    setCurrentSongIndex((prevIndex) => (prevIndex + 1) % songs.length);
    playSong();
  };

  const prevSong = () => {
    setCurrentSongIndex((prevIndex) => 
      prevIndex === 0 ? songs.length - 1 : prevIndex - 1
    );
    playSong();
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {songs.length > 0 ? (
        <>
          <Text style={styles.title}>{songs[currentSongIndex].title}</Text>
          <Text style={styles.artist}>{songs[currentSongIndex].artist}</Text>

          <View style={styles.controls}>
            <Button title="Previous" onPress={prevSong} />
            <Button 
              title={isPlaying ? "Pause" : "Play"} 
              onPress={togglePlayPause}
            />
            <Button title="Next" onPress={nextSong} />
          </View>
        </>
      ) : (
        <Text style={styles.noSongs}>No songs available</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  artist: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  controls: {
    flexDirection: 'row',
    gap: 10,
  },
  error: {
    color: 'red',
    textAlign: 'center',
  },
  noSongs: {
    fontSize: 18,
    color: '#666',
  },
});
