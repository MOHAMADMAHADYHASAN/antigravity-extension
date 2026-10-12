import React from 'react';

export class LegacyCard extends React.Component {
  componentWillReceiveProps(nextProps: any) {
    console.log('Props updated:', nextProps);
  }

  render() {
    return <div>Card</div>;
  }
}
