function NetworkStatus() {
  const [status, setStatus] = useState({});
  
  useEffect(() => {
    Meteor.call('debug.getNetworkStatus', (err, result) => {
      if (!err) setStatus(result);
    });
    
    const timer = setInterval(() => {
      Meteor.call('debug.getNetworkStatus', (err, result) => {
        if (!err) setStatus(result);
      });
    }, 10000);
    
    return () => clearInterval(timer);
  }, []);
  
  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      <Typography variant="h6">Network Status</Typography>
      <Typography variant="body2">
        Tracker Status: {status.trackerStatus || 'Unknown'}
      </Typography>
      <Typography variant="body2">
        DHT Status: {status.dhtStatus || 'Unknown'}
      </Typography>
      <Typography variant="body2">
        Public IP: {status.publicIp || 'Unknown'}
      </Typography>
    </Paper>
  );
}